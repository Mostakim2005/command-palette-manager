import { PluginSettingTab, Setting, setIcon } from "obsidian";
import type { App } from "obsidian";
import type { CpmSettings } from "./types";
import type CommandPaletteManagerPlugin from "./main";

/** Native Obsidian settings tab: hero launcher + global preference toggles. */
export class CommandManagerSettingTab extends PluginSettingTab {
	plugin: CommandPaletteManagerPlugin;

	constructor(app: App, plugin: CommandPaletteManagerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const hero = containerEl.createDiv({ cls: "cpm-settings-hero" });
		const heroLeft = hero.createDiv({ cls: "cpm-hero-left" });
		const heroIcon = heroLeft.createSpan({ cls: "cpm-hero-icon" });
		setIcon(heroIcon, "command");
		const heroText = heroLeft.createDiv();
		new Setting(heroText).setName("Command palette manager").setHeading();
		heroText.createEl("p", {
			text: "Visual command manager: add multiple aliases to any plugin command, rename & revert, hide commands, group by action, pin UI buttons, and build macros.",
		});

		const heroActions = hero.createDiv({ cls: "cpm-hero-actions" });
		const openMgrBtn = heroActions.createEl("button", {
			cls: "cpm-btn is-primary",
			text: "Open Full Manager Modal",
		});
		setIcon(openMgrBtn.createSpan({ cls: "cpm-svg" }), "layout");
		openMgrBtn.addEventListener("click", () => {
			this.plugin.openManager();
		});

		const openQpBtn = heroActions.createEl("button", {
			cls: "cpm-btn is-tonal",
			text: "Quick Palette",
		});
		setIcon(openQpBtn.createSpan({ cls: "cpm-svg" }), "zap");
		openQpBtn.addEventListener("click", () => {
			this.plugin.openQuickPalette();
		});

		const prefBox = containerEl.createDiv({ cls: "cpm-settings-prefs" });

		new Setting(prefBox)
			.setName("Command alias prefix mode")
			.setDesc(
				"Choose what prefix appears before aliases in the Command Palette and / Slash menu.",
			)
			.addDropdown((dd) => {
				dd.addOption("source", "Original Plugin Name (e.g. Note Toolbox: dropdown)")
					.addOption("none", "No Prefix — Clean Alias Only (e.g. dropdown)")
					.addOption("custom", "Custom Prefix Text")
					.addOption("manager", "Command Palette Manager")
					.setValue(this.plugin.settings.aliasPrefixMode || "source")
					.onChange(async (val) => {
						this.plugin.settings.aliasPrefixMode = val as CpmSettings["aliasPrefixMode"];
						await this.plugin.saveSettings();
						this.plugin.registry.syncAliases();
						this.plugin.registry.syncMacros();
						this.display();
					});
			});

		if (this.plugin.settings.aliasPrefixMode === "custom") {
			new Setting(prefBox)
				.setName("Custom alias prefix text")
				.setDesc("Short prefix shown before aliases when Custom mode is selected.")
				.addText((txt) => {
					txt
						.setPlaceholder("e.g. ⚡ or Alias")
						.setValue(this.plugin.settings.customAliasPrefix || "")
						.onChange(async (val) => {
							this.plugin.settings.customAliasPrefix = val.trim();
							await this.plugin.saveSettings();
							this.plugin.registry.syncAliases();
							this.plugin.registry.syncMacros();
						});
				});
		}

		new Setting(prefBox)
			.setName("Color accent theme")
			.setDesc("Adapt to active Obsidian theme colors, or choose a custom highlight accent.")
			.addDropdown((dd) => {
				dd.addOption("theme", "Follow Active Obsidian Theme Accent (Adaptive)")
					.addOption("custom", "Custom Accent Color")
					.setValue(this.plugin.settings.accentThemeMode || "theme")
					.onChange(async (val) => {
						this.plugin.settings.accentThemeMode = val as CpmSettings["accentThemeMode"];
						await this.plugin.saveSettings();
						this.display();
					});
			});

		if (this.plugin.settings.accentThemeMode === "custom") {
			new Setting(prefBox)
				.setName("Custom accent color")
				.setDesc("Choose your custom color accent.")
				.addColorPicker((cp) => {
					cp.setValue(this.plugin.settings.customAccentColor || "#00a884").onChange(
						async (val) => {
							this.plugin.settings.customAccentColor = val;
							await this.plugin.saveSettings();
						},
					);
				});
		}

		new Setting(prefBox)
			.setName("Command card display style")
			.setDesc("Switch between 1-Row Compact, 2-Row Balanced, or Multi-Column Grid Tiles.")
			.addDropdown((dd) => {
				dd.addOption("single", "1-Row Compact (Recommended)")
					.addOption("double", "2-Row Balanced Card")
					.addOption("grid", "Grid Tiles")
					.setValue(this.plugin.settings.cardStyle || "single")
					.onChange(async (val) => {
						this.plugin.settings.cardStyle = val as CpmSettings["cardStyle"];
						await this.plugin.saveSettings();
						this.display();
					});
			});

		new Setting(prefBox)
			.setName("Quick Palette default sort")
			.setDesc("Choose how commands are prioritized in the Quick Command Palette popup.")
			.addDropdown((dd) => {
				dd.addOption("frequency", "Most Used (Usage Frequency)")
					.addOption("recent", "Recently Executed")
					.addOption("pinned", "Starred Commands First")
					.addOption("alpha", "Alphabetical (A-Z)")
					.setValue(this.plugin.settings.quickPaletteSort || "frequency")
					.onChange(async (val) => {
						this.plugin.settings.quickPaletteSort =
							val as CpmSettings["quickPaletteSort"];
						await this.plugin.saveSettings();
					});
			});

		new Setting(prefBox)
			.setName("Bulk action toolbar behavior")
			.setDesc(
				"Choose whether the bulk action bar stays visible or auto-hides until you check a box.",
			)
			.addDropdown((dd) => {
				dd.addOption("contextual", "Contextual (Auto-Hide until checked)")
					.addOption("always", "Always Visible")
					.setValue(this.plugin.settings.bulkBarMode || "contextual")
					.onChange(async (val) => {
						this.plugin.settings.bulkBarMode = val as CpmSettings["bulkBarMode"];
						await this.plugin.saveSettings();
						this.display();
					});
			});

		new Setting(prefBox)
			.setName("Append aliases to original command name")
			.setDesc(
				"Also appends [alias1, alias2] to the original command entry so both are searchable.",
			)
			.addToggle((tog) => {
				tog.setValue(Boolean(this.plugin.settings.appendAliasesToOriginal)).onChange(
					async (val) => {
						this.plugin.settings.appendAliasesToOriginal = val;
						await this.plugin.saveSettings();
						this.plugin.registry.syncOverrides();
						this.display();
					},
				);
			});

		new Setting(prefBox)
			.setName("Show keyboard shortcut badges")
			.setDesc(
				"Display assigned hotkeys on each command card with 1-click jump to Hotkey settings.",
			)
			.addToggle((tog) => {
				tog.setValue(Boolean(this.plugin.settings.showHotkeys)).onChange(async (val) => {
					this.plugin.settings.showHotkeys = val;
					await this.plugin.saveSettings();
					this.display();
				});
			});

		new Setting(prefBox)
			.setName("Show source plugin badges")
			.setDesc("Show the plugin name badge next to each command title.")
			.addToggle((tog) => {
				tog.setValue(Boolean(this.plugin.settings.showPluginBadges)).onChange(
					async (val) => {
						this.plugin.settings.showPluginBadges = val;
						await this.plugin.saveSettings();
						this.display();
					},
				);
			});

		new Setting(prefBox)
			.setName("Confirm before revert or delete")
			.setDesc(
				"Show a confirmation warning before reverting commands or deleting groups/buttons/macros.",
			)
			.addToggle((tog) => {
				tog.setValue(Boolean(this.plugin.settings.confirmDestructive)).onChange(
					async (val) => {
						this.plugin.settings.confirmDestructive = val;
						await this.plugin.saveSettings();
					},
				);
			});

		new Setting(prefBox)
			.setName("Frosted glassmorphism theme")
			.setDesc(
				"Enable translucent glass panels with frosted blur backdrops and subtle luminous borders.",
			)
			.addToggle((tog) => {
				tog.setValue(Boolean(this.plugin.settings.glassmorphism)).onChange(async (val) => {
					this.plugin.settings.glassmorphism = val;
					await this.plugin.saveSettings();
					this.plugin.applyThemePreferences();
				});
			});

		new Setting(prefBox)
			.setName("Enable Quick Command Palette modal")
			.setDesc(
				"Enables the fast Quick Command Palette popup with Pinned, Recent, Alias, and Group filtering.",
			)
			.addToggle((tog) => {
				tog.setValue(Boolean(this.plugin.settings.enableQuickPalette)).onChange(
					async (val) => {
						this.plugin.settings.enableQuickPalette = val;
						await this.plugin.saveSettings();
						this.display();
					},
				);
			});
	}
}
