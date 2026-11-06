import { Plugin, Notice, normalizePath, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_SETTINGS, DEFAULT_ACTION_GROUPS } from "./settings";
import { CommandRegistryService, MacroEngine } from "./registry";
import { ButtonInjector } from "./buttons";
import { CommandManagerModal, QuickCommandPaletteModal } from "./modals";
import type { CpmSettings } from "./types";

/**
 * CommandPaletteManagerPlugin â€” faithful entry port (Nihon main.js L3878+).
 * Wires registry/macro/buttons, 2 commands, ribbon, settings tab.
 */
export default class CommandPaletteManagerPlugin extends Plugin {
  settings!: CpmSettings;
  registry!: CommandRegistryService;
  macroEngine!: MacroEngine;
  buttonInjector!: ButtonInjector;

  applyThemePreferences() {
    if (typeof document !== "undefined") {
      document.body.toggleClass("cpm-glassmorphic", Boolean(this.settings.glassmorphism));
    }
  }

  async onload() {
    await this.loadSettings();
    this.applyThemePreferences();

    this.registry = new CommandRegistryService(this.app, this);
    this.macroEngine = new MacroEngine(this.app, this);
    this.buttonInjector = new ButtonInjector(this.app, this);

    this.addCommand({
      id: "open-command-palette-manager",
      name: "Open Command Palette Manager",
      icon: "command",
      callback: () => new CommandManagerModal(this.app, this).open(),
    });

    this.addCommand({
      id: "open-quick-command-palette",
      name: "Open Quick Command Palette (Aliases, Pinned & Groups)",
      icon: "zap",
      callback: () => {
        if (!this.settings.enableQuickPalette) {
          new Notice("Quick Command Palette is disabled in settings. Opening Manager instead.");
          new CommandManagerModal(this.app, this).open();
          return;
        }
        new QuickCommandPaletteModal(this.app, this).open();
      },
    });

    this.addRibbonIcon("command", "Command Palette Manager", () => new CommandManagerModal(this.app, this).open());

    this.app.workspace.onLayoutReady(() => {
      this.registry.scanAndSyncAll();
      this.buttonInjector.syncButtons();
    });

    this.registerEvent(this.app.workspace.on("layout-change", () => this.buttonInjector.injectHeaderButtons()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.buttonInjector.injectHeaderButtons()));
    this.registerEvent(this.app.workspace.on("editor-menu", (menu) => this.buttonInjector.populateContextMenu(menu as any, "editor-menu")));
    this.registerEvent(this.app.workspace.on("file-menu", (menu) => this.buttonInjector.populateContextMenu(menu as any, "file-menu")));

    this.addSettingTab(new CommandManagerSettingTab(this.app, this));
  }

  openManager() {
    new CommandManagerModal(this.app, this).open();
  }

  openQuickPalette() {
    new QuickCommandPaletteModal(this.app, this).open();
  }

  executeCommand(cmdId: string) {
    return this.registry.executeCommandSafe(cmdId);
  }

  runMacro(macroId: string) {
    return this.macroEngine.runMacro(macroId);
  }

  addCommandAlias(cmdId: string, alias: string) {
    const entry = this.registry.ensureOverrideEntry(cmdId);
    const clean = alias.trim();
    if (clean && !entry.aliases.includes(clean)) {
      entry.aliases.push(clean);
      return this.saveSettings().then(() => this.registry.syncAliases());
    }
    return Promise.resolve();
  }

  getAllCommands() {
    return this.registry.getAllManagedCommands();
  }

  onunload() {
    if (typeof document !== "undefined") document.body.removeClass("cpm-glassmorphic");
    this.registry?.restoreAllOnUnload();
    this.buttonInjector?.clearInjectedButtons();
  }

  getBackupFilePath() {
    return normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}/backup.json`);
  }

  async saveBackupSnapshot() {
    try {
      await this.app.vault.adapter.write(this.getBackupFilePath(), JSON.stringify(this.settings, null, 2));
    } catch (e) {
      console.error("Failed to write backup.json", e);
    }
  }

  async restoreFromBackupSnapshot(): Promise<boolean> {
    try {
      const path = this.getBackupFilePath();
      if (!(await this.app.vault.adapter.exists(path))) return false;
      const raw = await this.app.vault.adapter.read(path);
      const parsed = JSON.parse(raw) as Partial<CpmSettings>;
      if (parsed && typeof parsed === "object") {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, parsed);
        await this.saveData(this.settings);
        return true;
      }
    } catch (e) {
      console.error("Failed to restore backup.json", e);
    }
    return false;
  }

  async loadSettings() {
    const loaded = (await this.loadData()) as Partial<CpmSettings> | undefined;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
    if (!Array.isArray(this.settings.actionGroups) || this.settings.actionGroups.length === 0) {
      this.settings.actionGroups = [...DEFAULT_ACTION_GROUPS];
    }
    if (!this.settings.commandStats) this.settings.commandStats = {};
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (this.settings.autoBackupOnSave) await this.saveBackupSnapshot();
  }
}

class CommandManagerSettingTab extends PluginSettingTab {
  constructor(app: any, public plugin: CommandPaletteManagerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Command Palette Manager" });
    new Setting(containerEl)
      .setName("Enable quick palette")
      .setDesc("Launch with Raycast-style fuzzy search.")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.enableQuickPalette).onChange(async (val) => {
        this.plugin.settings.enableQuickPalette = val;
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl)
      .setName("Glassmorphism")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.glassmorphism).onChange(async (val) => {
        this.plugin.settings.glassmorphism = val;
        await this.plugin.saveSettings();
        this.plugin.applyThemePreferences();
      }));
  }
}


