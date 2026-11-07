import { Notice, Plugin, normalizePath } from "obsidian";
import { DEFAULT_ACTION_GROUPS, DEFAULT_SETTINGS } from "./settings";
import { CommandRegistryService } from "./registry";
import { MacroEngine } from "./macro-engine";
import { ButtonInjector } from "./buttons";
import { CommandManagerModal } from "./command-manager-ui";
import { QuickCommandPaletteModal } from "./quick-palette";
import { CommandManagerSettingTab } from "./settings-tab";
import type { CpmSettings, ManagedCommand } from "./types";

/**
 * Plugin entry point.
 * Lifecycle only: settings, services, commands, ribbon and workspace wiring.
 */
export default class CommandPaletteManagerPlugin extends Plugin {
	settings!: CpmSettings;
	registry!: CommandRegistryService;
	macroEngine!: MacroEngine;
	buttonInjector!: ButtonInjector;

	applyThemePreferences(): void {
		if (typeof document !== "undefined") {
			document.body.toggleClass("cpm-glassmorphic", Boolean(this.settings.glassmorphism));
		}
	}

	async onload(): Promise<void> {
		await this.loadSettings();
		this.applyThemePreferences();

		this.registry = new CommandRegistryService(this.app, this);
		this.macroEngine = new MacroEngine(this.app, this);
		this.buttonInjector = new ButtonInjector(this.app, this);

		this.addCommand({
			id: "open-command-palette-manager",
			name: "Open Command Palette Manager",
			icon: "command",
			callback: () => {
				this.openManager();
			},
		});

		this.addCommand({
			id: "open-quick-command-palette",
			name: "Open Quick Command Palette (Aliases, Pinned & Groups)",
			icon: "zap",
			callback: () => {
				if (!this.settings.enableQuickPalette) {
					new Notice(
						"Quick Command Palette is disabled in settings. Opening Manager instead.",
					);
					this.openManager();
					return;
				}
				this.openQuickPalette();
			},
		});

		this.addRibbonIcon("command", "Command Palette Manager", () => {
			this.openManager();
		});

		this.app.workspace.onLayoutReady(() => {
			this.registry.scanAndSyncAll();
			this.buttonInjector.syncButtons();
		});

		this.registerEvent(
			this.app.workspace.on("layout-change", () => this.buttonInjector.injectHeaderButtons()),
		);
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () =>
				this.buttonInjector.injectHeaderButtons(),
			),
		);

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu) => {
				this.buttonInjector.populateContextMenu(menu, "editor-menu");
			}),
		);

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu) => {
				this.buttonInjector.populateContextMenu(menu, "file-menu");
			}),
		);

		this.addSettingTab(new CommandManagerSettingTab(this.app, this));
	}

	// --- Public inter-plugin API ---
	openManager(): void {
		new CommandManagerModal(this.app, this).open();
	}

	openQuickPalette(): void {
		new QuickCommandPaletteModal(this.app, this).open();
	}

	executeCommand(cmdId: string): boolean {
		return this.registry.executeCommandSafe(cmdId);
	}

	runMacro(macroId: string): Promise<void> {
		return this.macroEngine.runMacro(macroId);
	}

	addCommandAlias(cmdId: string, alias: string): Promise<void> {
		const entry = this.registry.ensureOverrideEntry(cmdId);
		const clean = alias.trim();
		if (clean && !entry.aliases.includes(clean)) {
			entry.aliases.push(clean);
			return this.saveSettings().then(() => this.registry.syncAliases());
		}
		return Promise.resolve();
	}

	getAllCommands(): ManagedCommand[] {
		return this.registry.getAllManagedCommands();
	}

	onunload(): void {
		if (typeof document !== "undefined") {
			document.body.removeClass("cpm-glassmorphic");
		}
		this.registry?.restoreAllOnUnload();
		this.buttonInjector?.clearInjectedButtons();
	}

	getBackupFilePath(): string {
		return normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}/backup.json`);
	}

	async saveBackupSnapshot(): Promise<void> {
		try {
			const path = this.getBackupFilePath();
			await this.app.vault.adapter.write(path, JSON.stringify(this.settings, null, 2));
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

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<CpmSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
		if (!Array.isArray(this.settings.actionGroups) || this.settings.actionGroups.length === 0) {
			this.settings.actionGroups = [...DEFAULT_ACTION_GROUPS];
		}
		if (!this.settings.commandStats) {
			this.settings.commandStats = {};
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		if (this.settings.autoBackupOnSave) {
			await this.saveBackupSnapshot();
		}
	}
}
