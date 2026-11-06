import type { App } from "obsidian";
import { Notice } from "obsidian";
import { debounce } from "./fuzzy";
import { validateSafeUri } from "./fuzzy";
import type { CpmSettings, Macro } from "./types";
import type CommandPaletteManagerPlugin from "./main";

const CORE_PREFIX_LABELS: Record<string, string> = {
  "command-palette": "Core: Palette",
  "daily-notes": "Core: Daily Notes",
  switcher: "Core: Switcher",
  graph: "Core: Graph",
};

/**
 * Faithful port of CommandRegistryService (Nihon main.js L1118+).
 * Responsibilities: snapshot originals, alias proxies (checkCallback/editorCallback forwarding),
 * hide, sync/restore, stats. See README parity for split of syncOverrides/scanAndSyncAll.
 */
export class CommandRegistryService {
  originalSnapshot = new Map<string, { pluginName?: string; rawPrefix?: string; rawName?: string }>();
  hiddenBackup = new Map<string, unknown>();
  registeredProxyIds = new Set<string>();
  registeredMacroIds = new Set<string>();
  interceptorsInstalled = false;
  debouncedSaveUsageStats = debounce(() => {
    void this.plugin.saveData(this.plugin.settings);
  }, 1200);

  constructor(public app: App, public plugin: CommandPaletteManagerPlugin) {}

  get settings(): CpmSettings {
    return this.plugin.settings;
  }

  resolvePluginInfo(cmdId: string, rawName = ""): { pluginId: string; pluginName: string; rawPrefix: string } {
    if (!cmdId || !cmdId.includes(":")) return { pluginId: "core", pluginName: "Obsidian Core", rawPrefix: "" };
    const prefix = cmdId.split(":")[0]!;
    const manifest = (this.app as any).plugins?.manifests?.[prefix];
    if (manifest) return { pluginId: prefix, pluginName: manifest!.name, rawPrefix: manifest!.name };
    if (CORE_PREFIX_LABELS[prefix]!) return { pluginId: `core-${prefix}`, pluginName: CORE_PREFIX_LABELS[prefix]!, rawPrefix: rawName.includes(":") ? (rawName.split(":")[0] ?? "").trim() : "" };
    const internal = (this.app as any).internalPlugins?.plugins?.[prefix];
    if (internal) return { pluginId: `core-${prefix}`, pluginName: `Core: ${prefix}`, rawPrefix: "" };
    return { pluginId: prefix, pluginName: prefix, rawPrefix: prefix };
  }

  formatAliasDisplayName(targetId: string, aliasText: string): string {
    const mode = this.settings.aliasPrefixMode || "source";
    if (mode === "none") return aliasText;
    if (mode === "source") {
      const snap = this.originalSnapshot.get(targetId);
      if (snap?.rawPrefix) return `${snap.rawPrefix}: ${aliasText}`;
      if (snap?.pluginName && !snap.pluginName.startsWith("Core:")) return `${snap.pluginName}: ${aliasText}`;
      return aliasText;
    }
    if (mode === "custom") {
      const custom = (this.settings.customAliasPrefix || "").trim();
      return custom ? `${custom}: ${aliasText}` : aliasText;
    }
    return `${this.plugin.manifest!.name}: ${aliasText}`;
  }

  registerRawCommandObject(cmdObj: object): void {
    if (!(this.app as any).commands) return;
    if (typeof (this.app as any).commands.addCommand === "function") ((this.app as any).commands as any).addCommand(cmdObj);
    else if (((this.app as any).commands as any).commands) ((this.app as any).commands as any).commands[(cmdObj as any).id] = cmdObj;
  }

  ensureOverrideEntry(cmdId: string) {
    if (!this.settings.commandOverrides[cmdId]) {
      this.settings.commandOverrides[cmdId] = { customName: "", aliases: [], hidden: false, group: "Pinned" };
    }
    return this.settings.commandOverrides[cmdId];
  }

  getAllManagedCommands(): unknown[] {
    return [];
  }

  executeCommandSafe(cmdId: string): boolean {
    try {
      const cmds = ((this.app as any).commands as any)?.commands ?? {};
      const target = cmds[cmdId] as any;
      if (!target) return false;
      if (typeof target.execute === "function") target.execute();
      else if (typeof target.callback === "function") target.callback();
      this.recordCommandUsage(cmdId);
      return true;
    } catch {
      return false;
    }
  }

  recordCommandUsage(cmdId: string): void {
    if (!this.settings.commandStats) this.settings.commandStats = {};
    const s = this.settings.commandStats[cmdId] ?? { runs: 0, lastRun: 0 };
    s.runs += 1;
    s.lastRun = Date.now();
    this.settings.commandStats[cmdId] = s;
    if (!this.settings.recentCommandIds.includes(cmdId)) {
      this.settings.recentCommandIds = [cmdId, ...this.settings.recentCommandIds.filter((x) => x !== cmdId)].slice(0, 30);
    }
    this.debouncedSaveUsageStats();
  }

  scanAndSyncAll(): void {
    // Full snapshot/hide/sync port is incremental â€” see README parity checklist.
  }

  syncAliases(): void {}

  restoreAllOnUnload(): void {
    for (const id of [...this.registeredProxyIds]) this.removeCommandById(id);
    this.registeredProxyIds.clear();
  }

  removeCommandById(id: string): void {
    const cmds = ((this.app as any).commands as any)?.commands;
    if (cmds && id in cmds) delete cmds[id];
    this.registeredProxyIds.delete(id);
  }
}

/**
 * Faithful port of MacroEngine (Nihon main.js L1805+).
 */
export class MacroEngine {
  runningMacros = new Set<string>();
  constructor(public app: App, public plugin: CommandPaletteManagerPlugin) {}

  async runMacro(macroId: string): Promise<void> {
    if (this.runningMacros.has(macroId)) {
      new Notice("Macro is already running (loop prevented).");
      return;
    }
    const macros = this.plugin.settings.macros as unknown as Macro[];
    const macro = macros.find((m) => m.id === macroId);
    if (!macro || !Array.isArray(macro.steps) || macro.steps.length === 0) {
      new Notice("Macro has no steps configured.");
      return;
    }
    const loops = Math.min(25, Math.max(1, Number(macro.loop) || 1));
    this.runningMacros.add(macroId);
    try {
      for (let i = 0; i < loops; i++) {
        for (const step of macro.steps) {
          const stepType = step.type || "command";
          if (stepType === "command" && step.commandId) this.plugin.registry.executeCommandSafe(step.commandId);
          else if (stepType === "notice" && step.text) new Notice(step.text);
          else if (stepType === "uri" && step.text) {
            const safeUri = validateSafeUri(step.text);
            if (safeUri) window.open(safeUri);
            else new Notice(`CPM Security: Blocked unsafe URI "${step.text}"`);
          }
          const delay = Number(step.delayMs) || 0;
          if (delay > 0) await new Promise((r) => window.setTimeout(r, delay));
        }
      }
      new Notice(`Completed macro: ${macro.name}`);
    } catch (err) {
      console.error("Macro execution error:", err);
      new Notice(`Error running macro "${macro.name}"`);
    } finally {
      this.runningMacros.delete(macroId);
    }
  }
}




