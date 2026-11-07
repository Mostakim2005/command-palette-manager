import { MarkdownView, Notice } from "obsidian";
import type { App } from "obsidian";
import { debounce } from "./fuzzy";
import { CORE_PREFIX_LABELS } from "./settings";
import type {
	CommandOverride,
	CommandSnapshot,
	CommandsApi,
	CpmSettings,
	InternalCommand,
	ManagedCommand,
	Macro,
} from "./types";
import type CommandPaletteManagerPlugin from "./main";

interface PluginManifestLike {
	name: string;
}

/**
 * Owns Obsidian's command table: snapshots originals, applies renames, hides commands
 * behind a backup map, registers alias/macro proxies, and tracks usage.
 *
 * Never deletes a command permanently — `hiddenBackup` plus the interceptors keep
 * hotkeys and third-party `executeCommandById` calls working.
 */
export class CommandRegistryService {
	originalSnapshot = new Map<string, CommandSnapshot>();
	hiddenBackup = new Map<string, InternalCommand>();
	registeredProxyIds = new Set<string>();
	registeredMacroIds = new Set<string>();
	interceptorsInstalled = false;

	origExecuteCommandById?: (id: string) => boolean;
	origListCommands?: () => InternalCommand[];
	origFindCommand?: (id: string) => InternalCommand | null | undefined;

	debouncedSaveUsageStats = debounce(() => {
		void this.plugin.saveData(this.plugin.settings);
	}, 1200);

	constructor(
		public app: App,
		public plugin: CommandPaletteManagerPlugin,
	) {}

	get settings(): CpmSettings {
		return this.plugin.settings;
	}

	private get commandsApi(): CommandsApi | undefined {
		return (this.app as unknown as { commands?: CommandsApi }).commands;
	}

	resolvePluginInfo(
		cmdId: string,
		rawName = "",
	): { pluginId: string; pluginName: string; rawPrefix: string } {
		if (!cmdId || !cmdId.includes(":")) {
			return { pluginId: "core", pluginName: "Obsidian Core", rawPrefix: "" };
		}
		const appInternals = this.app as unknown as {
			plugins?: { manifests?: Record<string, PluginManifestLike> };
			internalPlugins?: { plugins?: Record<string, unknown> };
		};
		const prefix = cmdId.split(":")[0] ?? "";
		const manifest = appInternals.plugins?.manifests?.[prefix];
		if (manifest) {
			return { pluginId: prefix, pluginName: manifest.name, rawPrefix: manifest.name };
		}
		const coreLabel = CORE_PREFIX_LABELS[prefix];
		if (coreLabel) {
			return {
				pluginId: `core-${prefix}`,
				pluginName: coreLabel,
				rawPrefix: rawName.includes(":") ? (rawName.split(":")[0] ?? "").trim() : "",
			};
		}
		const internal = appInternals.internalPlugins?.plugins?.[prefix];
		if (internal) {
			return { pluginId: `core-${prefix}`, pluginName: `Core: ${prefix}`, rawPrefix: "" };
		}
		return { pluginId: prefix, pluginName: prefix, rawPrefix: prefix };
	}

	formatAliasDisplayName(targetId: string, aliasText: string): string {
		const mode = this.settings.aliasPrefixMode || "source";
		if (mode === "none") {
			return aliasText;
		}
		if (mode === "source") {
			const snap = this.originalSnapshot.get(targetId);
			if (snap?.rawPrefix) {
				return `${snap.rawPrefix}: ${aliasText}`;
			}
			if (snap?.pluginName && !snap.pluginName.startsWith("Core:")) {
				return `${snap.pluginName}: ${aliasText}`;
			}
			return aliasText;
		}
		if (mode === "custom") {
			const custom = (this.settings.customAliasPrefix || "").trim();
			return custom ? `${custom}: ${aliasText}` : aliasText;
		}
		return `${this.plugin.manifest.name}: ${aliasText}`;
	}

	registerRawCommandObject(cmdObj: InternalCommand): void {
		const api = this.commandsApi;
		if (!api) return;
		if (typeof api.addCommand === "function") {
			api.addCommand(cmdObj);
		} else if (api.commands) {
			api.commands[cmdObj.id] = cmdObj;
		}
	}

	/**
	 * Registers a context-aware alias proxy that forwards checkCallback / editorCallback,
	 * so editor-only commands never pollute the palette in non-markdown views.
	 */
	registerAliasProxyCommand(
		fullProxyId: string,
		displayName: string,
		icon: string,
		targetId: string,
	): void {
		const getTarget = (): InternalCommand | undefined =>
			this.commandsApi?.commands?.[targetId] ?? this.hiddenBackup.get(targetId);

		const proxyCmd: InternalCommand = {
			id: fullProxyId,
			name: displayName,
			icon: icon || "terminal",
			checkCallback: (checking: boolean) => {
				const target = getTarget();
				if (!target) return false;

				if (typeof target.checkCallback === "function") {
					if (checking) {
						try {
							return Boolean(target.checkCallback(true));
						} catch {
							return false;
						}
					}
					return this.executeCommandSafe(targetId);
				}

				if (typeof target.editorCheckCallback === "function") {
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (!view || !view.editor) return false;
					if (checking) {
						try {
							return Boolean(target.editorCheckCallback(true, view.editor, view));
						} catch {
							return false;
						}
					}
					return this.executeCommandSafe(targetId);
				}

				if (typeof target.editorCallback === "function") {
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (!view || !view.editor) return false;
					if (checking) return true;
					return this.executeCommandSafe(targetId);
				}

				if (checking) return true;
				return this.executeCommandSafe(targetId);
			},
		};

		this.registerRawCommandObject(proxyCmd);
	}

	installCommandInterceptors(): void {
		const api = this.commandsApi;
		if (this.interceptorsInstalled || !api) return;

		this.origExecuteCommandById = api.executeCommandById?.bind(api);
		this.origListCommands =
			typeof api.listCommands === "function" ? api.listCommands.bind(api) : undefined;
		this.origFindCommand =
			typeof api.findCommand === "function" ? api.findCommand.bind(api) : undefined;

		if (this.origExecuteCommandById) {
			const orig = this.origExecuteCommandById;
			api.executeCommandById = (id: string) => {
				if (this.hiddenBackup.has(id)) {
					const hiddenCmd = this.hiddenBackup.get(id)!;
					api.commands[id] = hiddenCmd;
					try {
						this.recordCommandUsage(id);
						return orig(id);
					} finally {
						delete api.commands[id];
					}
				}
				this.recordCommandUsage(id);
				return orig(id);
			};
		}

		if (this.origFindCommand) {
			const orig = this.origFindCommand;
			api.findCommand = (id: string) => {
				const cmd = orig(id);
				if (cmd) return cmd;
				return this.hiddenBackup.get(id) ?? null;
			};
		}

		if (this.origListCommands) {
			const orig = this.origListCommands;
			api.listCommands = () => {
				const list = orig();
				return list.filter((cmd) => !this.hiddenBackup.has(cmd.id));
			};
		}

		this.interceptorsInstalled = true;
	}

	uninstallCommandInterceptors(): void {
		const api = this.commandsApi;
		if (!this.interceptorsInstalled || !api) return;
		if (this.origExecuteCommandById) api.executeCommandById = this.origExecuteCommandById;
		if (this.origListCommands) api.listCommands = this.origListCommands;
		if (this.origFindCommand) api.findCommand = this.origFindCommand;
		this.interceptorsInstalled = false;
	}

	getHotkeyForCommand(cmdId: string): string {
		if (!this.settings.showHotkeys) return "";
		try {
			const hotkeyManager = (
				this.app as unknown as {
					hotkeyManager?: {
						getHotkeys: (id: string) => { modifiers?: string[]; key: string }[];
						getDefaultHotkeys: (id: string) => { modifiers?: string[]; key: string }[];
					};
				}
			).hotkeyManager;
			if (!hotkeyManager) return "";
			const keys =
				hotkeyManager.getHotkeys(cmdId) || hotkeyManager.getDefaultHotkeys(cmdId);
			if (!Array.isArray(keys) || keys.length === 0) return "";
			const first = keys[0];
			if (!first) return "";
			const mods = (first.modifiers ?? []).join("+");
			return mods ? `${mods}+${first.key.toUpperCase()}` : first.key.toUpperCase();
		} catch {
			return "";
		}
	}

	openHotkeySettingsFor(queryText: string): void {
		try {
			const settingManager = (
				this.app as unknown as {
					setting?: {
						open: () => void;
						openTabById: (id: string) => void;
						activeTab?: { searchComponent?: { inputEl?: HTMLInputElement } };
					};
				}
			).setting;
			if (!settingManager) throw new Error("no settings manager");
			settingManager.open();
			settingManager.openTabById("hotkeys");
			const inputEl = settingManager.activeTab?.searchComponent?.inputEl;
			if (inputEl) {
				inputEl.value = queryText;
				inputEl.dispatchEvent(new Event("input"));
			}
		} catch {
			new Notice("Open Settings -> Hotkeys to bind shortcut.");
		}
	}

	inferSmartGroup(cmdId: string, cmdName: string): string {
		const text = `${cmdId} ${cmdName}`.toLowerCase();
		if (/(save|export|import|delete|rename|move|trash|new file|new note|folder|duplicate)/.test(text)) {
			return "File & Save";
		}
		if (/(link|backlink|open|tab|window|leaf|navigate|go to|switch|daily|graph)/.test(text)) {
			return "Links & Navigation";
		}
		if (/(image|audio|media|attach|canvas|excalidraw|pdf|embed|picker|gallery)/.test(text)) {
			return "Media & Assets";
		}
		if (/(bold|italic|heading|list|table|code|quote|format|toggle|fold|indent|callout|checkbox)/.test(text)) {
			return "Editing & Formatting";
		}
		if (/(search|find|replace|filter|query|tag)/.test(text)) {
			return "Search & Find";
		}
		if (/(sidebar|ribbon|status|theme|dark|light|zen|fullscreen|preview|source|view|split|pin)/.test(text)) {
			return "View & Layout";
		}
		if (/(macro|template|run|execute|script|command)/.test(text)) {
			return "Automation";
		}
		return "";
	}

	autoGroupCommands(overwriteExisting = false): number {
		let count = 0;
		for (const [id, snap] of this.originalSnapshot.entries()) {
			const existing = this.settings.commandOverrides[id]?.group;
			if (existing && !overwriteExisting) continue;

			const guessed = this.inferSmartGroup(id, snap.originalName);
			if (guessed) {
				if (!this.settings.actionGroups.includes(guessed)) {
					this.settings.actionGroups.push(guessed);
				}
				const entry = this.ensureOverrideEntry(id);
				entry.group = guessed;
				count++;
			}
		}
		return count;
	}

	scanAndSyncAll(): void {
		this.installCommandInterceptors();
		const liveCommands = this.commandsApi?.commands ?? {};

		for (const [id, cmd] of Object.entries(liveCommands)) {
			if (
				id.startsWith("cpm-alias:") ||
				id.startsWith(`${this.plugin.manifest.id}:alias-`) ||
				id.startsWith(`${this.plugin.manifest.id}:macro-`)
			) {
				continue;
			}
			if (!this.originalSnapshot.has(id)) {
				const info = this.resolvePluginInfo(id, cmd.name ?? "");
				this.originalSnapshot.set(id, {
					id,
					originalName: cmd.name || id,
					originalIcon: cmd.icon || "terminal",
					pluginId: info.pluginId,
					pluginName: info.pluginName,
					rawPrefix: info.rawPrefix,
				});
			}
		}

		if (!this.settings.autoGroupInitialized && this.originalSnapshot.size > 0) {
			this.autoGroupCommands(false);
			this.settings.autoGroupInitialized = true;
			void this.plugin.saveSettings();
		}

		this.syncOverrides();
		this.syncAliases();
		this.syncMacros();
	}

	getAllManagedCommands(): ManagedCommand[] {
		const list: ManagedCommand[] = [];
		const stats = this.settings.commandStats || {};

		for (const [id, snap] of this.originalSnapshot.entries()) {
			const override: Partial<CommandOverride> = this.settings.commandOverrides[id] ?? {};
			const liveCmd = this.commandsApi?.commands?.[id] ?? this.hiddenBackup.get(id);
			const hasCustomName = Boolean(
				override.customName && override.customName !== snap.originalName,
			);
			const hasAliases = Boolean(override.aliases && override.aliases.length > 0);
			const isHidden = Boolean(override.hidden);
			const isPinned = Boolean(override.pinned);
			const usage = stats[id];

			list.push({
				id,
				originalName: snap.originalName,
				currentName: hasCustomName ? (override.customName ?? "") : snap.originalName,
				customName: override.customName ?? "",
				icon: liveCmd?.icon || snap.originalIcon || "terminal",
				pluginId: snap.pluginId,
				pluginName: snap.pluginName,
				aliases: Array.isArray(override.aliases) ? override.aliases : [],
				hidden: isHidden,
				pinned: isPinned,
				group: override.group ?? "",
				hotkey: this.getHotkeyForCommand(id),
				runs: usage?.runs ?? 0,
				lastRun: usage?.lastRun ?? 0,
				isModified: hasCustomName || hasAliases || isHidden || isPinned,
			});
		}
		return list;
	}

	ensureOverrideEntry(id: string): CommandOverride {
		if (!this.settings.commandOverrides[id]) {
			this.settings.commandOverrides[id] = {
				customName: "",
				aliases: [],
				hidden: false,
				pinned: false,
				group: "",
			};
		}
		return this.settings.commandOverrides[id];
	}

	syncOverrides(): void {
		const liveCommands = this.commandsApi?.commands ?? {};

		for (const [id, snap] of this.originalSnapshot.entries()) {
			const override = this.settings.commandOverrides[id];

			if ((!override || !override.hidden) && this.hiddenBackup.has(id)) {
				liveCommands[id] = this.hiddenBackup.get(id)!;
				this.hiddenBackup.delete(id);
			}

			const targetCmd = liveCommands[id] ?? this.hiddenBackup.get(id);
			if (!targetCmd) continue;

			let baseName = override?.customName?.trim()
				? override.customName.trim()
				: snap.originalName;

			if (
				this.settings.appendAliasesToOriginal &&
				override &&
				Array.isArray(override.aliases) &&
				override.aliases.length > 0
			) {
				baseName = `${baseName} [${override.aliases.join(", ")}]`;
			}

			targetCmd.name = baseName;

			if (override?.hidden) {
				const live = liveCommands[id];
				if (live) {
					this.hiddenBackup.set(id, live);
					delete liveCommands[id];
				}
			}
		}
	}

	syncAliases(): void {
		for (const proxyId of this.registeredProxyIds) {
			this.removeCommandById(proxyId);
		}
		this.registeredProxyIds.clear();

		for (const [targetId, override] of Object.entries(this.settings.commandOverrides)) {
			if (!override || !Array.isArray(override.aliases)) continue;
			const snap = this.originalSnapshot.get(targetId);

			override.aliases.forEach((alias) => {
				const clean = alias.trim();
				if (!clean) return;
				const slug = clean.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
				const fullProxyId = `cpm-alias:${targetId.replace(/[:\s]/g, "-")}:${slug}`;
				const displayName = this.formatAliasDisplayName(targetId, clean);

				this.registerAliasProxyCommand(
					fullProxyId,
					displayName,
					snap?.originalIcon || "terminal",
					targetId,
				);
				this.registeredProxyIds.add(fullProxyId);
			});
		}
	}

	syncMacros(): void {
		for (const macroCmdId of this.registeredMacroIds) {
			this.removeCommandById(macroCmdId);
		}
		this.registeredMacroIds.clear();

		(this.settings.macros || []).forEach((macro) => {
			if (!macro.id || !macro.name) return;
			const fullId = `${this.plugin.manifest.id}:macro-${macro.id}`;
			const macroDisplay =
				this.settings.aliasPrefixMode === "none" ? macro.name : `Macro: ${macro.name}`;

			this.registerRawCommandObject({
				id: fullId,
				name: macroDisplay,
				icon: macro.icon || "sparkles",
				callback: () => void this.plugin.macroEngine.runMacro(macro.id),
			});
			this.registeredMacroIds.add(fullId);

			(macro.aliases || []).forEach((alias) => {
				const clean = alias.trim();
				if (!clean) return;
				const slug = clean.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
				const aliasFullId = `cpm-alias:macro-${macro.id}:${slug}`;
				const aliasDisplay =
					this.settings.aliasPrefixMode === "none"
						? clean
						: this.settings.aliasPrefixMode === "custom" && this.settings.customAliasPrefix
							? `${this.settings.customAliasPrefix}: ${clean}`
							: clean;

				this.registerRawCommandObject({
					id: aliasFullId,
					name: aliasDisplay,
					icon: macro.icon || "sparkles",
					callback: () => void this.plugin.macroEngine.runMacro(macro.id),
				});
				this.registeredMacroIds.add(aliasFullId);
			});
		});
	}

	recordCommandUsage(cmdId: string): void {
		if (!cmdId) return;
		if (!this.settings.commandStats) this.settings.commandStats = {};
		if (!this.settings.commandStats[cmdId]) {
			this.settings.commandStats[cmdId] = { runs: 0, lastRun: 0 };
		}
		const stat = this.settings.commandStats[cmdId];
		stat.runs += 1;
		stat.lastRun = Date.now();

		if (!Array.isArray(this.settings.recentCommandIds)) {
			this.settings.recentCommandIds = [];
		}
		this.settings.recentCommandIds = [
			cmdId,
			...this.settings.recentCommandIds.filter((id) => id !== cmdId),
		].slice(0, 30);

		this.debouncedSaveUsageStats();
	}

	executeCommandSafe(cmdId: string): boolean {
		if (cmdId.startsWith("macro:")) {
			const macroId = cmdId.slice("macro:".length);
			void this.plugin.macroEngine.runMacro(macroId);
			return true;
		}

		const api = this.commandsApi;
		if (!api) {
			new Notice(`Command "${cmdId}" is unavailable or its plugin is disabled.`);
			return false;
		}

		const liveCommands = api.commands || {};
		const execute = (): boolean =>
			api.executeCommandById ? api.executeCommandById(cmdId) : false;

		if (liveCommands[cmdId]) {
			this.recordCommandUsage(cmdId);
			return execute();
		}

		const hiddenCmd = this.hiddenBackup.get(cmdId);
		if (hiddenCmd) {
			liveCommands[cmdId] = hiddenCmd;
			try {
				this.recordCommandUsage(cmdId);
				return execute();
			} finally {
				delete liveCommands[cmdId];
			}
		}

		new Notice(`Command "${cmdId}" is unavailable or its plugin is disabled.`);
		return false;
	}

	revertCommand(id: string): void {
		const snap = this.originalSnapshot.get(id);
		const prevGroup = this.settings.commandOverrides[id]?.group || "";
		if (prevGroup) {
			this.settings.commandOverrides[id] = {
				customName: "",
				aliases: [],
				hidden: false,
				pinned: false,
				group: prevGroup,
			};
		} else {
			delete this.settings.commandOverrides[id];
		}

		const liveCommands = this.commandsApi?.commands;
		if (liveCommands && this.hiddenBackup.has(id)) {
			liveCommands[id] = this.hiddenBackup.get(id)!;
			this.hiddenBackup.delete(id);
		}

		const restored = liveCommands?.[id];
		if (snap && restored) {
			restored.name = snap.originalName;
		}

		this.syncAliases();
	}

	removeCommandById(fullId: string): void {
		const api = this.commandsApi;
		if (api && typeof api.removeCommand === "function") {
			api.removeCommand(fullId);
		}
		if (api?.commands && api.commands[fullId]) {
			delete api.commands[fullId];
		}
	}

	cleanOrphanedOverrides(): number {
		let cleaned = 0;
		const currentIds = new Set(this.originalSnapshot.keys());
		for (const id of Object.keys(this.settings.commandOverrides)) {
			if (!currentIds.has(id)) {
				delete this.settings.commandOverrides[id];
				cleaned++;
			}
		}
		return cleaned;
	}

	restoreAllOnUnload(): void {
		this.uninstallCommandInterceptors();

		const liveCommands = this.commandsApi?.commands;
		if (liveCommands) {
			for (const [id, cmd] of this.hiddenBackup.entries()) {
				liveCommands[id] = cmd;
			}
		}
		this.hiddenBackup.clear();

		for (const [id, snap] of this.originalSnapshot.entries()) {
			const live = liveCommands?.[id];
			if (live) {
				live.name = snap.originalName;
			}
		}

		for (const proxyId of this.registeredProxyIds) {
			this.removeCommandById(proxyId);
		}
		this.registeredProxyIds.clear();

		for (const macroId of this.registeredMacroIds) {
			this.removeCommandById(macroId);
		}
		this.registeredMacroIds.clear();

		// Flush any pending debounced usage stats.
		void this.plugin.saveData(this.settings);
	}

	importExternalConfigs(): number {
		let importedCount = 0;
		const appPlugins = (
			this.app as unknown as {
				plugins?: { plugins?: Record<string, { settings?: Record<string, unknown> }> };
			}
		).plugins?.plugins;

		const cmdr = appPlugins?.["cmdr"]?.settings as
			| {
					hide?: { commands?: string[] };
					macros?: {
						name?: string;
						commands?: { id?: string; commandId?: string; delay?: number }[];
						icon?: string;
					}[];
					pageHeader?: { id?: string; commandId?: string; icon?: string; color?: string; mode?: string }[];
					statusBar?: { id?: string; commandId?: string; icon?: string; color?: string; mode?: string }[];
					leftRibbon?: { id?: string; commandId?: string; icon?: string; color?: string; mode?: string }[];
					editorMenu?: { id?: string; commandId?: string; icon?: string; color?: string; mode?: string }[];
					fileMenu?: { id?: string; commandId?: string; icon?: string; color?: string; mode?: string }[];
				}
			| undefined;

		if (cmdr) {
			if (Array.isArray(cmdr.hide?.commands)) {
				cmdr.hide.commands.forEach((id) => {
					const entry = this.ensureOverrideEntry(id);
					if (!entry.hidden) {
						entry.hidden = true;
						importedCount++;
					}
				});
			}
			if (Array.isArray(cmdr.macros)) {
				cmdr.macros.forEach((m, idx) => {
					const macroId = `cmdr-${idx}-${Date.now()}`;
					const steps = (m.commands ?? [])
						.map((s) => ({
							type: "command" as const,
							commandId: s.id || s.commandId || "",
							text: "",
							delayMs: Number(s.delay) || 0,
						}))
						.filter((s) => Boolean(s.commandId));

					if (steps.length > 0 && !this.settings.macros.some((ex) => ex.name === m.name)) {
						const macro: Macro = {
							id: macroId,
							name: m.name || `Imported Macro ${idx + 1}`,
							icon: m.icon || "sparkles",
							aliases: [],
							loop: 1,
							steps,
						};
						this.settings.macros.push(macro);
						importedCount++;
					}
				});
			}

			const importBtnList = (
				arr: { id?: string; commandId?: string; icon?: string; color?: string; mode?: string }[] | undefined,
				location: "header" | "statusbar" | "ribbon" | "editor-menu" | "file-menu",
			) => {
				if (!Array.isArray(arr)) return;
				arr.forEach((b) => {
					const cmdId = b.id || b.commandId;
					if (!cmdId) return;
					const exists = this.settings.pinnedButtons.some(
						(p) => p.commandId === cmdId && p.location === location,
					);
					if (!exists) {
						const snap = this.originalSnapshot.get(cmdId);
						this.settings.pinnedButtons.push({
							id: `btn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
							commandId: cmdId,
							icon: b.icon || snap?.originalIcon || "terminal",
							label: snap?.originalName || cmdId,
							location,
							color: b.color || "",
							device: (b.mode as "all" | "desktop" | "mobile") || "all",
							displayMode: "icon",
							tooltip: snap?.originalName || cmdId,
						});
						importedCount++;
					}
				});
			};

			importBtnList(cmdr.pageHeader, "header");
			importBtnList(cmdr.statusBar, "statusbar");
			importBtnList(cmdr.leftRibbon, "ribbon");
			importBtnList(cmdr.editorMenu, "editor-menu");
			importBtnList(cmdr.fileMenu, "file-menu");
		}

		const bcp = appPlugins?.["better-command-palette"]?.settings as
			| { hiddenCommands?: string[] }
			| undefined;
		if (bcp && Array.isArray(bcp.hiddenCommands)) {
			bcp.hiddenCommands.forEach((id) => {
				const entry = this.ensureOverrideEntry(id);
				if (!entry.hidden) {
					entry.hidden = true;
					importedCount++;
				}
			});
		}

		if (importedCount > 0) {
			this.scanAndSyncAll();
			this.plugin.buttonInjector.syncButtons();
		}
		return importedCount;
	}
}
