import { Plugin, Notice, normalizePath } from "obsidian";
import { DEFAULT_SETTINGS, DEFAULT_ACTION_GROUPS } from "./settings";
import type { CpmSettings } from "./types";
// Full 4035-line bundle split is incremental. This entry ports the
// proven onload/commands/settings lifecycle from Nihon 1.2.0 verbatim in
// behaviour, with typed settings. Registry/UI/Macro engines live in
// their own modules as the split proceeds — see README "Parity" section.
export default class CommandPaletteManagerPlugin extends Plugin {
	settings!: CpmSettings;
	// Registry and UI modules attach here once split out.
	registry: any = null;
	macroEngine: any = null;
	buttonInjector: any = null;

	applyThemePreferences() {
		if (typeof document !== "undefined") {
			document.body.toggleClass("cpm-glassmorphic", Boolean(this.settings.glassmorphism));
		}
	}

	async onload() {
		await this.loadSettings();
		this.applyThemePreferences();

		// TODO: import CommandRegistryService, MacroEngine, ButtonInjector
		// and assign to this.registry / this.macroEngine / this.buttonInjector
		// (next split step — see parity checklist in README).
		console.warn("[command-palette-manager] registry/UI split pending — entry lifecycle only in pilot.");

		this.addCommand({
			id: "open-command-palette-manager",
			name: "Open Command Palette Manager",
			icon: "command",
			callback: () => {
				new Notice("Command Palette Manager UI port in progress — see README parity section.");
			},
		});

		this.addCommand({
			id: "open-quick-command-palette",
			name: "Open Quick Command Palette (Aliases, Pinned & Groups)",
			icon: "zap",
			callback: () => {
				if (!this.settings.enableQuickPalette) {
					new Notice("Quick Command Palette is disabled in settings.");
					return;
				}
				new Notice("Quick palette port in progress — see README parity section.");
			},
		});

		this.addRibbonIcon("command", "Command Palette Manager", () => {
			new Notice("Command Palette Manager — pilot build.");
		});

		this.addSettingTab(new CommandPaletteManagerSettingPlaceholder(this.app, this));
	}

	onunload() {
		if (typeof document !== "undefined") {
			document.body.removeClass("cpm-glassmorphic");
		}
	}

	getBackupFilePath() {
		return normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}/backup.json`);
	}

	async saveBackupSnapshot() {
		try {
			const path = this.getBackupFilePath();
			await this.app.vault.adapter.write(path, JSON.stringify(this.settings, null, 2));
		} catch (e) {
			console.error("Failed to write backup.json", e);
		}
	}

	async restoreFromBackupSnapshot() {
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
		if (!this.settings.commandStats) {
			this.settings.commandStats = {};
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		if (this.settings.autoBackupOnSave) {
			await this.saveBackupSnapshot();
		}
	}
}

import { PluginSettingTab, Setting, App } from "obsidian";
class CommandPaletteManagerSettingPlaceholder extends PluginSettingTab {
	constructor(app: App, private plugin: CommandPaletteManagerPlugin) {
		super(app, plugin);
	}
	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Command Palette Manager — pilot" });
		containerEl.createEl("p", { text: "Full settings UI port is next split step. Defaults match Nihon 1.2.0." });
	}
}
