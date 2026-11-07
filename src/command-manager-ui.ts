import { Menu, Modal, Notice, setIcon, setTooltip } from "obsidian";
import type { App } from "obsidian";
import {
	AssignCommandsToGroupModal,
	ConfirmModal,
	InputModal,
	VisualIconPickerModal,
} from "./modals";
import { voidAsync } from "./async";
import {
	DEFAULT_ACTION_GROUPS,
	DEFAULT_SETTINGS,
	DEFAULT_STARTER_BUTTONS,
	MACRO_TEMPLATES,
} from "./settings";
import type { CommandRegistryService } from "./registry";
import type { CpmSettings, MacroStepType, ManagedCommand } from "./types";
import type CommandPaletteManagerPlugin from "./main";

interface GroupBucket {
	cmd: ManagedCommand;
	idx: number;
}

/**
 * Full management surface: Commands, Groups, UI Buttons and Macros tabs.
 * Rendered either inside `CommandManagerModal` or any other container.
 */
export class CommandManagerUI {
	app: App;
	registry: CommandRegistryService;
	activeTab = "commands";
	searchQuery = "";
	selectedPlugin = "all";
	selectedGroup = "all";
	statusFilter = "all";
	groupingMode = "none";
	selectedCmdIds = new Set<string>();
	lastClickedIdx: number | null = null;
	activeMacroId: string | null = null;
	newBtnIcon = "sparkles";
	newStepType: MacroStepType = "command";
	renderLimit = 70;
	collapsedSections = new Set<string>();
	currentFilteredCommands: ManagedCommand[] = [];
	bulkBarContainer?: HTMLElement;

	constructor(
		public plugin: CommandPaletteManagerPlugin,
		public containerEl: HTMLElement,
		public isModal = true,
		public onCloseModal: (() => void) | null = null,
	) {
		this.app = plugin.app;
		this.registry = plugin.registry;
	}

	get settings(): CpmSettings {
		return this.plugin.settings;
	}

	runDestructive(
		title: string,
		message: string,
		confirmLabel: string,
		actionFn: () => void | Promise<void>,
	): void {
		if (!this.settings.confirmDestructive) {
			void actionFn();
			return;
		}
		new ConfirmModal(this.app, title, message, confirmLabel, actionFn).open();
	}

	async saveAndApply(rerender = true): Promise<void> {
		await this.plugin.saveSettings();
		this.registry.scanAndSyncAll();
		this.plugin.buttonInjector.syncButtons();
		if (rerender) this.render();
	}

	async restoreDefaultsAndAutoGroup(): Promise<void> {
		DEFAULT_ACTION_GROUPS.forEach((g) => {
			if (!this.settings.actionGroups.includes(g)) {
				this.settings.actionGroups.push(g);
			}
		});

		DEFAULT_STARTER_BUTTONS.forEach((starter) => {
			const exists = this.settings.pinnedButtons.some(
				(b) => b.commandId === starter.commandId && b.location === starter.location,
			);
			if (!exists) {
				this.settings.pinnedButtons.push({
					...starter,
					id: `btn-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
				});
			}
		});

		const groupedCount = this.registry.autoGroupCommands(false);
		await this.saveAndApply(true);
		new Notice(
			`Restored default Action Groups, starter UI buttons, and auto-grouped ${groupedCount} command(s).`,
		);
	}

	showToolsMenu(evt: MouseEvent): void {
		const menu = new Menu();

		const prefixModes = [
			{ id: "source", label: "Prefix: Source Plugin (e.g. Note Toolbox: drop)" },
			{ id: "none", label: "Prefix: Clean / None (e.g. drop)" },
			{
				id: "custom",
				label: `Prefix: Custom ("${this.settings.customAliasPrefix || "⚡"}: drop")`,
			},
			{ id: "manager", label: "Prefix: Command Palette Manager" },
		];
		prefixModes.forEach((pm) => {
			menu.addItem((item) => {
				item
					.setTitle(`${this.settings.aliasPrefixMode === pm.id ? "✓ " : ""}${pm.label}`)
					.setIcon("tag")
					.onClick(async () => {
						if (pm.id === "custom") {
							new InputModal(
								this.app,
								"Set Custom Alias Prefix",
								"Enter prefix (e.g. ⚡ or Alias)...",
								this.settings.customAliasPrefix || "⚡",
								async (val) => {
									this.settings.customAliasPrefix = val;
									this.settings.aliasPrefixMode = "custom";
									await this.saveAndApply(false);
									new Notice(`Alias prefix set to "${val}: <alias>"`);
								},
							).open();
						} else {
							this.settings.aliasPrefixMode = pm.id as CpmSettings["aliasPrefixMode"];
							await this.saveAndApply(false);
							new Notice("Updated alias prefix mode.");
						}
					});
			});
		});

		menu.addSeparator();

		menu.addItem((item) => {
			item
				.setTitle(
					`${this.settings.appendAliasesToOriginal ? "✓ " : ""}Append [aliases] to Command Name`,
				)
				.setIcon("link")
				.onClick(async () => {
					this.settings.appendAliasesToOriginal = !this.settings.appendAliasesToOriginal;
					await this.saveAndApply(true);
				});
		});

		menu.addItem((item) => {
			item
				.setTitle(`${this.settings.showHotkeys ? "✓ " : ""}Show Keyboard Shortcut Badges`)
				.setIcon("command")
				.onClick(async () => {
					this.settings.showHotkeys = !this.settings.showHotkeys;
					await this.saveAndApply(true);
				});
		});

		menu.addItem((item) => {
			item
				.setTitle(`${this.settings.showPluginBadges ? "✓ " : ""}Show Source Plugin Badges`)
				.setIcon("puzzle")
				.onClick(async () => {
					this.settings.showPluginBadges = !this.settings.showPluginBadges;
					await this.saveAndApply(true);
				});
		});

		menu.addItem((item) => {
			item
				.setTitle(`${this.settings.confirmDestructive ? "✓ " : ""}Confirm Before Revert or Delete`)
				.setIcon("alert-triangle")
				.onClick(async () => {
					this.settings.confirmDestructive = !this.settings.confirmDestructive;
					await this.saveAndApply(false);
				});
		});

		menu.addItem((item) => {
			item
				.setTitle(`${this.settings.enableQuickPalette ? "✓ " : ""}Enable Quick Command Palette Modal`)
				.setIcon("zap")
				.onClick(async () => {
					this.settings.enableQuickPalette = !this.settings.enableQuickPalette;
					await this.saveAndApply(true);
				});
		});

		menu.addSeparator();

		menu.addItem((item) => {
			item
				.setTitle("Clean Orphaned Plugin Overrides")
				.setIcon("trash-2")
				.onClick(async () => {
					const cleaned = this.registry.cleanOrphanedOverrides();
					if (cleaned > 0) {
						await this.saveAndApply(true);
						new Notice(`Removed ${cleaned} orphaned command override(s).`);
					} else {
						new Notice("No orphaned overrides found.");
					}
				});
		});

		menu.addItem((item) => {
			item
				.setTitle("Restore Defaults & Auto-Group Commands")
				.setIcon("wand")
				.onClick(() => void this.restoreDefaultsAndAutoGroup());
		});

		menu.addItem((item) => {
			item
				.setTitle("Import from Commander (CMDR) / Better Command Palette")
				.setIcon("download")
				.onClick(async () => {
					const count = this.registry.importExternalConfigs();
					if (count > 0) {
						await this.plugin.saveSettings();
						this.render();
						new Notice(`Imported ${count} item(s).`);
					} else {
						new Notice("No new items found in Commander or Better Command Palette.");
					}
				});
		});

		menu.addSeparator();

		menu.addItem((item) => {
			item
				.setTitle("Export Settings to Clipboard (JSON)")
				.setIcon("copy")
				.onClick(async () => {
					if (navigator.clipboard?.writeText) {
						await navigator.clipboard.writeText(JSON.stringify(this.settings, null, 2));
						new Notice("Settings copied to clipboard!");
					}
				});
		});

		menu.addItem((item) => {
			item
				.setTitle("Import Settings from Clipboard")
				.setIcon("clipboard")
				.onClick(() => {
					new InputModal(
						this.app,
						"Import Settings JSON",
						"Paste JSON settings here...",
						"",
						async (val) => {
							try {
								const parsed = JSON.parse(val) as Partial<CpmSettings>;
								if (parsed && typeof parsed === "object") {
									this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS, parsed);
									await this.saveAndApply(true);
									new Notice("Settings successfully imported!");
								}
							} catch {
								new Notice("Invalid JSON format.");
							}
						},
					).open();
				});
		});

		menu.addItem((item) => {
			item
				.setTitle("Save Snapshot Backup (backup.json)")
				.setIcon("save")
				.onClick(async () => {
					await this.plugin.saveBackupSnapshot();
					new Notice("Saved backup.json in plugin folder.");
				});
		});

		menu.addItem((item) => {
			item
				.setTitle("Restore from Backup (backup.json)")
				.setIcon("rotate-ccw")
				.onClick(() => {
					this.runDestructive(
						"Restore from JSON Backup?",
						"Overwrite current settings with your saved backup.json snapshot?",
						"Restore Backup",
						async () => {
							const ok = await this.plugin.restoreFromBackupSnapshot();
							if (ok) {
								this.registry.scanAndSyncAll();
								this.plugin.buttonInjector.syncButtons();
								this.render();
								new Notice("Restored settings from backup.json.");
							} else {
								new Notice("No backup.json found yet.");
							}
						},
					);
				});
		});

		menu.showAtMouseEvent(evt);
	}

	render(): void {
		this.registry.scanAndSyncAll();
		this.containerEl.empty();
		const root = this.containerEl.createDiv({ cls: "cpm-root" });

		if (this.settings.accentThemeMode === "custom" && this.settings.customAccentColor) {
			root.style.setProperty("--cpm-accent", this.settings.customAccentColor);
			root.style.setProperty("--cpm-accent-hover", this.settings.customAccentColor);
		}

		const headerBar = root.createDiv({ cls: "cpm-header-bar" });

		const brand = headerBar.createDiv({ cls: "cpm-brand" });
		const brandIcon = brand.createSpan({ cls: "cpm-brand-icon" });
		setIcon(brandIcon, "command");
		brand.createEl("h2", { text: "Command Manager" });

		const navTabs = headerBar.createDiv({ cls: "cpm-nav-pills" });
		const tabs = [
			{ id: "commands", label: "Commands", icon: "terminal" },
			{
				id: "groups",
				label: `Groups (${(this.settings.actionGroups || []).length})`,
				icon: "layers",
			},
			{
				id: "buttons",
				label: `UI Buttons (${(this.settings.pinnedButtons || []).length})`,
				icon: "pin",
			},
			{
				id: "macros",
				label: `Macros (${(this.settings.macros || []).length})`,
				icon: "sparkles",
			},
		];

		tabs.forEach((t) => {
			const btn = navTabs.createEl("button", {
				cls: `cpm-nav-pill ${this.activeTab === t.id ? "is-active" : ""}`,
			});
			setIcon(btn.createSpan({ cls: "cpm-svg" }), t.icon);
			btn.createSpan({ text: t.label });
			btn.addEventListener("click", () => {
				this.activeTab = t.id;
				this.render();
			});
		});

		const rightControls = headerBar.createDiv({ cls: "cpm-header-controls" });

		if (this.activeTab === "commands") {
			const prefixSelect = rightControls.createEl("select", { cls: "cpm-select cpm-select-xs" });
			setTooltip(prefixSelect, "Choose how aliases appear in Command Palette & / Slash menu");
			[
				{ id: "source", label: "Prefix: Source Plugin" },
				{ id: "none", label: "Prefix: Clean / None" },
				{ id: "custom", label: `Prefix: Custom (${this.settings.customAliasPrefix || "⚡"})` },
				{ id: "manager", label: "Prefix: Manager" },
			].forEach((p) => {
				const opt = prefixSelect.createEl("option", { text: p.label, value: p.id });
				opt.selected = (this.settings.aliasPrefixMode || "source") === p.id;
			});
			prefixSelect.addEventListener("change", voidAsync(async () => {
				if (prefixSelect.value === "custom") {
					new InputModal(
						this.app,
						"Custom Alias Prefix",
						"Prefix text (e.g. ⚡ or Alias)...",
						this.settings.customAliasPrefix || "⚡",
						async (val) => {
							this.settings.customAliasPrefix = val;
							this.settings.aliasPrefixMode = "custom";
							await this.saveAndApply(true);
						},
					).open();
				} else {
					this.settings.aliasPrefixMode =
						prefixSelect.value as CpmSettings["aliasPrefixMode"];
					await this.saveAndApply(false);
					new Notice("Updated alias prefix format.");
				}
			}));

			const styleSeg = rightControls.createDiv({ cls: "cpm-segmented" });
			[
				{ id: "single", label: "1-Row", icon: "minus", tip: "Compact single-row layout" },
				{ id: "double", label: "2-Row", icon: "rows", tip: "Balanced two-row card layout" },
				{ id: "grid", label: "Grid", icon: "layout-grid", tip: "Multi-column grid tiles" },
			].forEach((st) => {
				const segBtn = styleSeg.createEl("button", {
					cls: `cpm-seg-btn ${this.settings.cardStyle === st.id ? "is-active" : ""}`,
				});
				setIcon(segBtn.createSpan({ cls: "cpm-svg" }), st.icon);
				segBtn.createSpan({ text: st.label });
				setTooltip(segBtn, st.tip);
				segBtn.addEventListener("click", voidAsync(async () => {
					this.settings.cardStyle = st.id as CpmSettings["cardStyle"];
					await this.saveAndApply(true);
				}));
			});
		}

		if (this.settings.enableQuickPalette) {
			const qpBtn = rightControls.createEl("button", { cls: "cpm-btn cpm-btn-xs is-tonal" });
			setIcon(qpBtn.createSpan({ cls: "cpm-svg" }), "zap");
			qpBtn.createSpan({ text: "Quick Palette" });
			qpBtn.addEventListener("click", () => {
				if (this.isModal && this.onCloseModal) this.onCloseModal();
				this.plugin.openQuickPalette();
			});
		}

		const toolsBtn = rightControls.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
		setIcon(toolsBtn.createSpan({ cls: "cpm-svg" }), "sliders");
		toolsBtn.createSpan({ text: "Options & Tools" });
		toolsBtn.addEventListener("click", (evt) => this.showToolsMenu(evt));

		if (this.isModal && this.onCloseModal) {
			const closeBtn = rightControls.createEl("button", { cls: "cpm-icon-btn" });
			setIcon(closeBtn, "x");
			setTooltip(closeBtn, "Close (Esc)");
			closeBtn.addEventListener("click", () => {
				if (this.onCloseModal) this.onCloseModal();
			});
		}

		const body = root.createDiv({ cls: "cpm-body" });
		if (this.activeTab === "commands") {
			this.renderCommandsTab(body);
		} else if (this.activeTab === "groups") {
			this.renderGroupsTab(body);
		} else if (this.activeTab === "buttons") {
			this.renderButtonsTab(body);
		} else if (this.activeTab === "macros") {
			this.renderMacrosTab(body);
		}
	}

	renderCommandsTab(container: HTMLElement): void {
		const allCommands = this.registry.getAllManagedCommands();

		const pluginMap = new Map<string, string>();
		allCommands.forEach((c) => pluginMap.set(c.pluginId, c.pluginName));
		const sortedPlugins = Array.from(pluginMap.entries()).sort((a, b) =>
			a[1].localeCompare(b[1]),
		);

		const filterGrid = container.createDiv({ cls: "cpm-control-grid" });

		const masterCheck = filterGrid.createDiv({ cls: "cpm-checkbox" });
		setTooltip(masterCheck, "Select / Deselect visible commands");
		if (this.selectedCmdIds.size > 0) setIcon(masterCheck, "check");
		masterCheck.addEventListener("click", () => {
			if (this.selectedCmdIds.size > 0) {
				this.selectedCmdIds.clear();
			} else {
				(this.currentFilteredCommands || []).forEach((c) => this.selectedCmdIds.add(c.id));
			}
			this.render();
		});

		const searchWrap = filterGrid.createDiv({ cls: "cpm-search-wrap" });
		const searchIcon = searchWrap.createSpan({ cls: "cpm-search-wrap-icon" });
		setIcon(searchIcon, "search");

		const searchInput = searchWrap.createEl("input", {
			type: "search",
			placeholder: "Search command, alias, plugin, @group, or hotkey...",
			cls: "cpm-input cpm-search-field",
		});
		searchInput.value = this.searchQuery;

		const pluginSelect = filterGrid.createEl("select", { cls: "cpm-select" });
		pluginSelect.createEl("option", { text: "Plugin: All", value: "all" });
		sortedPlugins.forEach(([pid, pname]) => {
			const opt = pluginSelect.createEl("option", { text: pname, value: pid });
			opt.selected = pid === this.selectedPlugin;
		});

		const groupModeSelect = filterGrid.createEl("select", { cls: "cpm-select" });
		[
			{ id: "none", label: "Group: Flat List" },
			{ id: "action", label: "Group: By Action Type" },
			{ id: "plugin", label: "Group: By Plugin" },
		].forEach((m) => {
			const opt = groupModeSelect.createEl("option", { text: m.label, value: m.id });
			opt.selected = m.id === this.groupingMode;
		});

		const statusSelect = filterGrid.createEl("select", { cls: "cpm-select" });
		[
			{ id: "all", label: "State: All" },
			{ id: "pinned", label: "State: Starred (★)" },
			{ id: "modified", label: "State: Modified / Aliased" },
			{ id: "hidden", label: "State: Hidden Only" },
		].forEach((s) => {
			const opt = statusSelect.createEl("option", { text: s.label, value: s.id });
			opt.selected = s.id === this.statusFilter;
		});

		const bulkToggleBtn = filterGrid.createEl("button", {
			cls: `cpm-btn cpm-btn-xs ${
				this.settings.bulkBarMode === "always" || this.selectedCmdIds.size > 0 ? "is-tonal" : ""
			}`,
		});
		setIcon(bulkToggleBtn.createSpan({ cls: "cpm-svg" }), "check-square");
		bulkToggleBtn.createSpan({
			text: this.selectedCmdIds.size > 0 ? `${this.selectedCmdIds.size} Sel` : "Bulk",
		});
		setTooltip(bulkToggleBtn, "Toggle Bulk Action Bar (Always Visible vs Contextual)");
		bulkToggleBtn.addEventListener("click", voidAsync(async () => {
			this.settings.bulkBarMode =
				this.settings.bulkBarMode === "always" ? "contextual" : "always";
			await this.saveAndApply(true);
		}));

		let listViewport: HTMLElement;

		const chipStrip = container.createDiv({ cls: "cpm-chip-strip" });
		const allGroups = [
			{ id: "all", label: "All Groups" },
			...(this.settings.actionGroups || []).map((g) => ({ id: g, label: g })),
		];
		allGroups.forEach((g) => {
			const count =
				g.id === "all"
					? allCommands.length
					: g.id === "Pinned"
						? allCommands.filter((c) => c.pinned || c.group === "Pinned").length
						: allCommands.filter((c) => c.group === g.id).length;

			const chip = chipStrip.createEl("button", {
				cls: `cpm-chip ${this.selectedGroup === g.id ? "is-active" : ""}`,
			});
			chip.createSpan({ text: g.label });
			chip.createSpan({ cls: "cpm-chip-badge", text: String(count) });
			chip.addEventListener("click", () => {
				this.selectedGroup = g.id;
				this.renderLimit = 70;
				this.renderListRows(listViewport, this.registry.getAllManagedCommands());
				chipStrip.querySelectorAll(".cpm-chip").forEach((el) => el.removeClass("is-active"));
				chip.addClass("is-active");
			});
		});

		const addGroupChip = chipStrip.createEl("button", { cls: "cpm-chip is-add-chip" });
		setIcon(addGroupChip.createSpan({ cls: "cpm-svg" }), "plus");
		addGroupChip.createSpan({ text: "New Group" });
		addGroupChip.addEventListener("click", () => {
			new InputModal(
				this.app,
				"Create Action Group",
				"Group name (e.g. Daily Workflow)...",
				"",
				async (val) => {
					if (!this.settings.actionGroups.includes(val)) {
						this.settings.actionGroups.push(val);
						await this.saveAndApply(true);
					}
				},
			).open();
		});

		this.bulkBarContainer = container.createDiv({ cls: "cpm-bulk-wrap" });

		listViewport = container.createDiv({
			cls: `cpm-viewport is-${this.settings.cardStyle || "single"}`,
		});

		// Chunked infinite scroll: append the next slice instead of re-rendering everything.
		listViewport.addEventListener("scroll", () => {
			if (
				this.groupingMode === "none" &&
				this.currentFilteredCommands &&
				this.renderLimit < this.currentFilteredCommands.length
			) {
				const nearBottom =
					listViewport.scrollTop + listViewport.clientHeight >=
					listViewport.scrollHeight - 200;
				if (nearBottom) {
					const prevLimit = this.renderLimit;
					this.renderLimit += 50;
					const nextSlice = this.currentFilteredCommands.slice(prevLimit, this.renderLimit);
					window.requestAnimationFrame(() => {
						nextSlice.forEach((cmd, offset) => {
							this.buildCommandItem(listViewport, cmd, prevLimit + offset);
						});
					});
				}
			}
		});

		const debouncedSearch = debounceInput(() => {
			this.searchQuery = searchInput.value;
			this.renderLimit = 70;
			this.renderListRows(listViewport, this.registry.getAllManagedCommands());
		}, 110);

		searchInput.addEventListener("input", debouncedSearch);
		pluginSelect.addEventListener("change", () => {
			this.selectedPlugin = pluginSelect.value;
			this.renderLimit = 70;
			this.renderListRows(listViewport, this.registry.getAllManagedCommands());
		});
		groupModeSelect.addEventListener("change", () => {
			this.groupingMode = groupModeSelect.value;
			this.renderListRows(listViewport, this.registry.getAllManagedCommands());
		});
		statusSelect.addEventListener("change", () => {
			this.statusFilter = statusSelect.value;
			this.renderLimit = 70;
			this.renderListRows(listViewport, this.registry.getAllManagedCommands());
		});

		this.renderListRows(listViewport, allCommands);
	}

	renderBulkBar(viewport: HTMLElement): void {
		if (!this.bulkBarContainer) return;
		this.bulkBarContainer.empty();

		const shouldShow = this.settings.bulkBarMode === "always" || this.selectedCmdIds.size > 0;
		if (!shouldShow) return;

		const bar = this.bulkBarContainer.createDiv({ cls: "cpm-bulk-bar" });
		const left = bar.createDiv({ cls: "cpm-row-group" });
		left.createSpan({
			cls: "cpm-pill-count",
			text: `${this.selectedCmdIds.size} selected`,
		});

		left
			.createEl("button", { text: "All", cls: "cpm-btn cpm-btn-xs" })
			.addEventListener("click", () => {
				(this.currentFilteredCommands || []).forEach((c) => this.selectedCmdIds.add(c.id));
				this.renderListRows(viewport, this.registry.getAllManagedCommands(), false);
			});
		left
			.createEl("button", { text: "None", cls: "cpm-btn cpm-btn-xs" })
			.addEventListener("click", () => {
				this.selectedCmdIds.clear();
				this.renderListRows(viewport, this.registry.getAllManagedCommands(), false);
			});
		left
			.createEl("button", { text: "Invert", cls: "cpm-btn cpm-btn-xs" })
			.addEventListener("click", () => {
				(this.currentFilteredCommands || []).forEach((c) => {
					if (this.selectedCmdIds.has(c.id)) this.selectedCmdIds.delete(c.id);
					else this.selectedCmdIds.add(c.id);
				});
				this.renderListRows(viewport, this.registry.getAllManagedCommands(), false);
			});

		const right = bar.createDiv({ cls: "cpm-row-group" });
		const bulkGroupSelect = right.createEl("select", { cls: "cpm-select cpm-select-xs" });
		bulkGroupSelect.createEl("option", { text: "Assign Group...", value: "" });
		bulkGroupSelect.createEl("option", { text: "— Clear Group —", value: "__clear__" });
		(this.settings.actionGroups || []).forEach((g) => {
			bulkGroupSelect.createEl("option", { text: g, value: g });
		});
		bulkGroupSelect.addEventListener("change", voidAsync(async () => {
			const val = bulkGroupSelect.value;
			if (!val || this.selectedCmdIds.size === 0) {
				bulkGroupSelect.value = "";
				return;
			}
			this.selectedCmdIds.forEach((id) => {
				const entry = this.registry.ensureOverrideEntry(id);
				entry.group = val === "__clear__" ? "" : val;
			});
			bulkGroupSelect.value = "";
			await this.saveAndApply(true);
		}));

		const hideBtn = right.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
		setIcon(hideBtn.createSpan({ cls: "cpm-svg" }), "eye-off");
		hideBtn.createSpan({ text: "Hide" });
		hideBtn.addEventListener("click", voidAsync(async () => {
			if (!this.selectedCmdIds.size) {
				new Notice("Select commands first.");
				return;
			}
			this.selectedCmdIds.forEach((id) => {
				this.registry.ensureOverrideEntry(id).hidden = true;
			});
			await this.saveAndApply(false);
			this.renderListRows(viewport, this.registry.getAllManagedCommands(), false);
		}));

		const unhideBtn = right.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
		setIcon(unhideBtn.createSpan({ cls: "cpm-svg" }), "eye");
		unhideBtn.createSpan({ text: "Show" });
		unhideBtn.addEventListener("click", voidAsync(async () => {
			if (!this.selectedCmdIds.size) {
				new Notice("Select commands first.");
				return;
			}
			this.selectedCmdIds.forEach((id) => {
				this.registry.ensureOverrideEntry(id).hidden = false;
			});
			await this.saveAndApply(false);
			this.renderListRows(viewport, this.registry.getAllManagedCommands(), false);
		}));

		const revertBtn = right.createEl("button", { cls: "cpm-btn cpm-btn-xs is-danger" });
		setIcon(revertBtn.createSpan({ cls: "cpm-svg" }), "rotate-ccw");
		revertBtn.createSpan({ text: "Revert" });
		revertBtn.addEventListener("click", () => {
			if (!this.selectedCmdIds.size) {
				new Notice("Select commands first.");
				return;
			}
			this.runDestructive(
				"Revert Selected Commands?",
				`Restore ${this.selectedCmdIds.size} command(s) to original default names, aliases, and visibility?`,
				"Revert",
				async () => {
					this.selectedCmdIds.forEach((id) => this.registry.revertCommand(id));
					this.selectedCmdIds.clear();
					await this.saveAndApply(false);
					this.renderListRows(viewport, this.registry.getAllManagedCommands(), false);
				},
			);
		});
	}

	renderListRows(
		viewport: HTMLElement,
		allCommands: ManagedCommand[],
		resetScroll = true,
	): void {
		viewport.empty();
		if (resetScroll) viewport.scrollTop = 0;

		const q = this.searchQuery.trim().toLowerCase();
		this.currentFilteredCommands = allCommands.filter((c) => {
			if (this.selectedPlugin !== "all" && c.pluginId !== this.selectedPlugin) return false;
			if (this.selectedGroup === "Pinned") {
				if (!c.pinned && c.group !== "Pinned") return false;
			} else if (this.selectedGroup !== "all" && c.group !== this.selectedGroup) {
				return false;
			}
			if (this.statusFilter === "pinned" && !c.pinned) return false;
			if (this.statusFilter === "modified" && !c.isModified) return false;
			if (this.statusFilter === "hidden" && !c.hidden) return false;

			if (q) {
				const matchCurrent = c.currentName.toLowerCase().includes(q);
				const matchOrig = c.originalName.toLowerCase().includes(q);
				const matchId = c.id.toLowerCase().includes(q);
				const matchPlugin = c.pluginName.toLowerCase().includes(q);
				const matchHotkey = (c.hotkey || "").toLowerCase().includes(q);
				const matchAlias = c.aliases.some((a) => a.toLowerCase().includes(q));
				if (
					!matchCurrent &&
					!matchOrig &&
					!matchId &&
					!matchPlugin &&
					!matchHotkey &&
					!matchAlias
				) {
					return false;
				}
			}
			return true;
		});

		this.renderBulkBar(viewport);

		if (this.currentFilteredCommands.length === 0) {
			viewport.createDiv({
				cls: "cpm-empty",
				text: "No commands match your current filters.",
			});
			return;
		}

		if (this.groupingMode === "action" || this.groupingMode === "plugin") {
			const buckets = new Map<string, GroupBucket[]>();
			this.currentFilteredCommands.forEach((cmd, idx) => {
				const key =
					this.groupingMode === "action" ? cmd.group || "Ungrouped" : cmd.pluginName || "Other";
				if (!buckets.has(key)) buckets.set(key, []);
				buckets.get(key)!.push({ cmd, idx });
			});

			const topActionRow = viewport.createDiv({ cls: "cpm-group-toolbar" });
			const toggleAllBtn = topActionRow.createEl("button", {
				cls: "cpm-btn cpm-btn-xs is-tonal",
				text: this.collapsedSections.size > 0 ? "Expand All Sections" : "Collapse All Sections",
			});
			toggleAllBtn.addEventListener("click", () => {
				if (this.collapsedSections.size > 0) {
					this.collapsedSections.clear();
				} else {
					for (const key of buckets.keys()) this.collapsedSections.add(key);
				}
				this.renderListRows(viewport, this.registry.getAllManagedCommands(), false);
			});

			for (const [sectionTitle, items] of buckets.entries()) {
				const isCollapsed = this.collapsedSections.has(sectionTitle);
				const divider = viewport.createDiv({
					cls: `cpm-section-head ${isCollapsed ? "is-collapsed" : ""}`,
				});

				const chevron = divider.createSpan({ cls: "cpm-section-chevron cpm-svg" });
				setIcon(chevron, isCollapsed ? "chevron-right" : "chevron-down");

				setIcon(
					divider.createSpan({ cls: "cpm-svg" }),
					this.groupingMode === "action" ? "layers" : "puzzle",
				);
				divider.createSpan({ text: sectionTitle, cls: "cpm-section-title" });
				divider.createSpan({ cls: "cpm-chip-badge", text: `${items.length}` });

				divider.addEventListener("click", () => {
					if (this.collapsedSections.has(sectionTitle)) {
						this.collapsedSections.delete(sectionTitle);
					} else {
						this.collapsedSections.add(sectionTitle);
					}
					this.renderListRows(viewport, this.registry.getAllManagedCommands(), false);
				});

				if (!isCollapsed) {
					items.forEach(({ cmd, idx }) => {
						this.buildCommandItem(viewport, cmd, idx);
					});
				}
			}
		} else {
			const visibleSlice = this.currentFilteredCommands.slice(0, this.renderLimit);
			visibleSlice.forEach((cmd, idx) => {
				this.buildCommandItem(viewport, cmd, idx);
			});
		}
	}

	buildCommandItem(viewport: HTMLElement, cmd: ManagedCommand, idx: number): void {
		const isSelected = this.selectedCmdIds.has(cmd.id);
		const styleMode = this.settings.cardStyle || "single";
		const card = viewport.createDiv({
			cls: `cpm-item is-${styleMode} ${isSelected ? "is-selected" : ""} ${
				cmd.hidden ? "is-hidden-cmd" : ""
			}`,
		});

		const primary = card.createDiv({ cls: "cpm-item-primary" });

		const check = primary.createDiv({ cls: "cpm-checkbox" });
		if (isSelected) setIcon(check, "check");
		check.addEventListener("click", (evt) => {
			if (evt.shiftKey && this.lastClickedIdx !== null) {
				const start = Math.min(this.lastClickedIdx, idx);
				const end = Math.max(this.lastClickedIdx, idx);
				const targetState = !this.selectedCmdIds.has(cmd.id);
				for (let i = start; i <= end; i++) {
					const item = this.currentFilteredCommands[i];
					if (item) {
						if (targetState) this.selectedCmdIds.add(item.id);
						else this.selectedCmdIds.delete(item.id);
					}
				}
				this.renderLimit = Math.max(this.renderLimit, end + 10);
				this.renderListRows(viewport, this.registry.getAllManagedCommands(), false);
			} else {
				if (this.selectedCmdIds.has(cmd.id)) {
					this.selectedCmdIds.delete(cmd.id);
					card.removeClass("is-selected");
					check.empty();
				} else {
					this.selectedCmdIds.add(cmd.id);
					card.addClass("is-selected");
					setIcon(check, "check");
				}
				this.lastClickedIdx = idx;
				this.renderBulkBar(viewport);
			}
		});

		const starBtn = primary.createEl("button", {
			cls: `cpm-icon-btn cpm-star-btn ${cmd.pinned ? "is-starred" : ""}`,
		});
		setIcon(starBtn, "star");
		setTooltip(starBtn, cmd.pinned ? "Unpin from Starred" : "Star / Pin command to top");
		starBtn.addEventListener("click", voidAsync(async () => {
			const entry = this.registry.ensureOverrideEntry(cmd.id);
			cmd.pinned = !cmd.pinned;
			entry.pinned = cmd.pinned;
			starBtn.toggleClass("is-starred", cmd.pinned);
			await this.saveAndApply(false);
		}));

		if (this.settings.showPluginBadges) {
			const pluginTag = primary.createSpan({
				cls: "cpm-plugin-tag",
				text: cmd.pluginName,
			});
			pluginTag.title = `ID: ${cmd.id}`;
		}

		const titleWrap = primary.createDiv({ cls: "cpm-title-col" });
		const nameInput = titleWrap.createEl("input", {
			type: "text",
			value: cmd.currentName,
			cls: "cpm-name-input",
		});
		setTooltip(nameInput, "Click to rename command");

		const commitRename = async () => {
			const val = nameInput.value.trim();
			const entry = this.registry.ensureOverrideEntry(cmd.id);
			if (!val || val === cmd.originalName) {
				entry.customName = "";
				nameInput.value = cmd.originalName;
			} else {
				entry.customName = val;
			}
			await this.saveAndApply(false);
			this.renderListRows(viewport, this.registry.getAllManagedCommands(), false);
		};

		nameInput.addEventListener("blur", voidAsync(commitRename));
		nameInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				nameInput.blur();
			}
		});

		if (cmd.customName && cmd.customName !== cmd.originalName) {
			titleWrap.createSpan({
				cls: "cpm-orig-note",
				text: `Default: ${cmd.originalName}`,
			});
		}

		if (this.settings.showHotkeys && cmd.hotkey) {
			const hkBadge = primary.createSpan({
				cls: "cpm-kbd-badge",
				text: cmd.hotkey,
			});
			setTooltip(hkBadge, "Click to configure hotkey in Obsidian Settings");
			hkBadge.addEventListener("click", () => {
				this.registry.openHotkeySettingsFor(cmd.currentName);
			});
		}

		if (cmd.runs && cmd.runs > 0) {
			primary.createSpan({
				cls: "cpm-usage-pill",
				text: `${cmd.runs} runs`,
			});
		}

		const secondary = card.createDiv({ cls: "cpm-item-secondary" });

		const aliasZone = secondary.createDiv({ cls: "cpm-alias-zone" });
		cmd.aliases.forEach((alias, aIdx) => {
			const pill = aliasZone.createSpan({ cls: "cpm-alias-pill" });
			const formattedPreview = this.registry.formatAliasDisplayName(cmd.id, alias);
			pill.createSpan({ text: alias });
			setTooltip(pill, `Palette trigger: "${formattedPreview}"`);

			const del = pill.createSpan({ cls: "cpm-alias-x", text: "×" });
			del.addEventListener("click", voidAsync(async () => {
				const entry = this.registry.ensureOverrideEntry(cmd.id);
				entry.aliases.splice(aIdx, 1);
				await this.saveAndApply(false);
				this.renderListRows(viewport, this.registry.getAllManagedCommands(), false);
			}));
		});

		const aliasInput = aliasZone.createEl("input", {
			type: "text",
			placeholder: "+ alias...",
			cls: "cpm-alias-field",
		});
		setTooltip(aliasInput, "Type alias (or comma-separated aliases) and press Enter");

		const commitAlias = async () => {
			const raw = aliasInput.value.trim();
			if (!raw) return;
			const entry = this.registry.ensureOverrideEntry(cmd.id);
			raw
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
				.forEach((tok) => {
					if (!entry.aliases.includes(tok)) entry.aliases.push(tok);
				});
			aliasInput.value = "";
			await this.saveAndApply(false);
			this.renderListRows(viewport, this.registry.getAllManagedCommands(), false);
		};
		aliasInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				void commitAlias();
			}
		});
		aliasInput.addEventListener("blur", voidAsync(commitAlias));

		const controlsZone = secondary.createDiv({ cls: "cpm-controls-zone" });

		const groupSelect = controlsZone.createEl("select", { cls: "cpm-select cpm-select-xs" });
		groupSelect.createEl("option", { text: "No Group", value: "" });
		(this.settings.actionGroups || []).forEach((g) => {
			const opt = groupSelect.createEl("option", { text: g, value: g });
			opt.selected = cmd.group === g;
		});
		groupSelect.addEventListener("change", voidAsync(async () => {
			const entry = this.registry.ensureOverrideEntry(cmd.id);
			entry.group = groupSelect.value;
			cmd.group = groupSelect.value;
			await this.saveAndApply(false);
		}));

		const runBtn = controlsZone.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
		setIcon(runBtn.createSpan({ cls: "cpm-svg" }), "play");
		runBtn.createSpan({ text: "Run" });
		setTooltip(runBtn, "Execute command now");
		runBtn.addEventListener("click", () => {
			this.registry.executeCommandSafe(cmd.id);
		});

		const hideBtn = controlsZone.createEl("button", {
			cls: `cpm-btn cpm-btn-xs ${cmd.hidden ? "is-warn" : ""}`,
		});
		const hideIconSpan = hideBtn.createSpan({ cls: "cpm-svg" });
		setIcon(hideIconSpan, cmd.hidden ? "eye-off" : "eye");
		const hideTextSpan = hideBtn.createSpan({ text: cmd.hidden ? "Hidden" : "Visible" });
		setTooltip(hideBtn, "Toggle command visibility in Command Palette");
		hideBtn.addEventListener("click", voidAsync(async () => {
			const entry = this.registry.ensureOverrideEntry(cmd.id);
			cmd.hidden = !cmd.hidden;
			entry.hidden = cmd.hidden;
			card.toggleClass("is-hidden-cmd", cmd.hidden);
			hideBtn.toggleClass("is-warn", cmd.hidden);
			setIcon(hideIconSpan, cmd.hidden ? "eye-off" : "eye");
			hideTextSpan.setText(cmd.hidden ? "Hidden" : "Visible");
			await this.saveAndApply(false);
		}));

		const pinBtn = controlsZone.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
		setIcon(pinBtn.createSpan({ cls: "cpm-svg" }), "pin");
		pinBtn.createSpan({ text: "Pin UI" });
		setTooltip(pinBtn, "Pin as UI Button (Header, Ribbon, Status Bar, or Menu)");
		pinBtn.addEventListener("click", voidAsync(async () => {
			this.settings.pinnedButtons.push({
				id: `btn-${Date.now()}`,
				commandId: cmd.id,
				icon: cmd.icon || "terminal",
				label: cmd.currentName,
				location: "header",
				color: "",
				device: "all",
				displayMode: "icon",
				tooltip: cmd.currentName,
			});
			await this.saveAndApply(false);
			new Notice(`Pinned "${cmd.currentName}" to Note Header.`);
		}));

		const revertBtn = controlsZone.createEl("button", {
			cls: `cpm-btn cpm-btn-xs ${cmd.isModified ? "is-tonal" : ""}`,
			attr: { disabled: !cmd.isModified ? "true" : null },
		});
		setIcon(revertBtn.createSpan({ cls: "cpm-svg" }), "rotate-ccw");
		revertBtn.createSpan({ text: "Revert" });
		setTooltip(revertBtn, "Revert command to original default name, aliases & visibility");
		revertBtn.addEventListener("click", () => {
			this.runDestructive(
				"Revert Command?",
				`Restore "${cmd.originalName}" to default name, clear aliases, and unhide it?`,
				"Revert",
				async () => {
					this.registry.revertCommand(cmd.id);
					await this.saveAndApply(false);
					this.renderListRows(viewport, this.registry.getAllManagedCommands(), false);
				},
			);
		});
	}

	renderGroupsTab(container: HTMLElement): void {
		const bar = container.createDiv({ cls: "cpm-toolbar-row" });
		const input = bar.createEl("input", {
			type: "text",
			placeholder: "Create new Action Group (e.g. Daily Workflow)...",
			cls: "cpm-input cpm-flex-1",
		});

		const addBtn = bar.createEl("button", { cls: "cpm-btn is-primary" });
		setIcon(addBtn.createSpan({ cls: "cpm-svg" }), "plus");
		addBtn.createSpan({ text: "Create Group" });

		const autoBtn = bar.createEl("button", { cls: "cpm-btn is-tonal" });
		setIcon(autoBtn.createSpan({ cls: "cpm-svg" }), "wand");
		autoBtn.createSpan({ text: "Restore Defaults & Auto-Group" });
		autoBtn.addEventListener("click", () => void this.restoreDefaultsAndAutoGroup());

		const handleAdd = async () => {
			const val = input.value.trim();
			if (!val) return;
			if (!this.settings.actionGroups.includes(val)) {
				this.settings.actionGroups.push(val);
				await this.saveAndApply(true);
			}
		};
		addBtn.addEventListener("click", voidAsync(handleAdd));
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") void handleAdd();
		});

		const list = container.createDiv({ cls: "cpm-viewport is-single" });
		const allCmds = this.registry.getAllManagedCommands();
		const groups = this.settings.actionGroups || [];

		groups.forEach((groupName, idx) => {
			const count =
				groupName === "Pinned"
					? allCmds.filter((c) => c.pinned || c.group === "Pinned").length
					: allCmds.filter((c) => c.group === groupName).length;

			const row = list.createDiv({ cls: "cpm-flat-card" });
			const left = row.createDiv({ cls: "cpm-row-group cpm-flex-1" });
			setIcon(left.createSpan({ cls: "cpm-svg" }), "layers");

			const nameIn = left.createEl("input", {
				type: "text",
				value: groupName,
				cls: "cpm-name-input",
			});
			nameIn.addEventListener("blur", voidAsync(async () => {
				const next = nameIn.value.trim();
				if (!next || next === groupName) {
					nameIn.value = groupName;
					return;
				}
				this.settings.actionGroups[idx] = next;
				Object.values(this.settings.commandOverrides).forEach((ov) => {
					if (ov.group === groupName) ov.group = next;
				});
				await this.saveAndApply(true);
			}));

			const right = row.createDiv({ cls: "cpm-row-group" });
			right.createSpan({ cls: "cpm-pill-count", text: `${count} command(s)` });

			const assignBtn = right.createEl("button", { cls: "cpm-btn cpm-btn-xs is-tonal" });
			setIcon(assignBtn.createSpan({ cls: "cpm-svg" }), "plus");
			assignBtn.createSpan({ text: "Assign Commands" });
			assignBtn.addEventListener("click", () => {
				new AssignCommandsToGroupModal(this.app, this.plugin, groupName, () =>
					this.render(),
				).open();
			});

			const viewBtn = right.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
			setIcon(viewBtn.createSpan({ cls: "cpm-svg" }), "eye");
			viewBtn.createSpan({ text: "Filter View" });
			viewBtn.addEventListener("click", () => {
				this.selectedGroup = groupName;
				this.activeTab = "commands";
				this.render();
			});

			const delBtn = right.createEl("button", { cls: "cpm-btn cpm-btn-xs is-danger" });
			setIcon(delBtn.createSpan({ cls: "cpm-svg" }), "trash-2");
			delBtn.createSpan({ text: "Delete" });
			delBtn.addEventListener("click", () => {
				this.runDestructive(
					`Delete Action Group "${groupName}"?`,
					`Delete "${groupName}"? Assigned commands will become ungrouped.`,
					"Delete Group",
					async () => {
						this.settings.actionGroups.splice(idx, 1);
						Object.values(this.settings.commandOverrides).forEach((ov) => {
							if (ov.group === groupName) ov.group = "";
						});
						await this.saveAndApply(true);
					},
				);
			});
		});
	}

	renderButtonsTab(container: HTMLElement): void {
		const allCmds = this.registry.getAllManagedCommands();
		const macros = this.settings.macros || [];

		const addBar = container.createDiv({ cls: "cpm-toolbar-row" });
		const cmdSelect = addBar.createEl("select", { cls: "cpm-select cpm-flex-1" });
		cmdSelect.createEl("option", { text: "Select command or macro to pin...", value: "" });
		macros.forEach((m) => {
			cmdSelect.createEl("option", { text: `[Macro] ${m.name}`, value: `macro:${m.id}` });
		});
		allCmds.forEach((c) => {
			cmdSelect.createEl("option", { text: `${c.pluginName}: ${c.currentName}`, value: c.id });
		});

		const locSelect = addBar.createEl("select", { cls: "cpm-select" });
		[
			{ id: "header", label: "Note Header (Top Right)" },
			{ id: "ribbon", label: "Left Ribbon" },
			{ id: "statusbar", label: "Status Bar" },
			{ id: "editor-menu", label: "Editor Right-Click Menu" },
			{ id: "file-menu", label: "File Explorer Menu" },
		].forEach((l) => locSelect.createEl("option", { text: l.label, value: l.id }));

		const iconPickerBtn = addBar.createEl("button", { cls: "cpm-btn" });
		setIcon(iconPickerBtn.createSpan({ cls: "cpm-svg" }), this.newBtnIcon);
		iconPickerBtn.createSpan({ text: this.newBtnIcon });
		iconPickerBtn.addEventListener("click", () => {
			new VisualIconPickerModal(this.app, this.newBtnIcon, (chosen) => {
				this.newBtnIcon = chosen;
				this.render();
			}).open();
		});

		const pinBtn = addBar.createEl("button", { cls: "cpm-btn is-primary" });
		setIcon(pinBtn.createSpan({ cls: "cpm-svg" }), "pin");
		pinBtn.createSpan({ text: "Pin Button" });
		pinBtn.addEventListener("click", voidAsync(async () => {
			const targetId = cmdSelect.value;
			if (!targetId) {
				new Notice("Select a command or macro first.");
				return;
			}

			let label = targetId;
			if (targetId.startsWith("macro:")) {
				const m = macros.find((x) => `macro:${x.id}` === targetId);
				if (m) label = m.name;
			} else {
				const c = allCmds.find((x) => x.id === targetId);
				if (c) label = c.currentName;
			}

			this.settings.pinnedButtons.push({
				id: `btn-${Date.now()}`,
				commandId: targetId,
				icon: this.newBtnIcon || "terminal",
				label,
				location: locSelect.value as "header",
				color: "",
				device: "all",
				displayMode: "icon",
				tooltip: label,
			});
			await this.saveAndApply(true);
		}));

		const list = container.createDiv({ cls: "cpm-viewport is-single" });
		const buttons = this.settings.pinnedButtons || [];
		if (buttons.length === 0) {
			const empty = list.createDiv({ cls: "cpm-empty" });
			empty.createEl("p", { text: "No UI buttons pinned." });
			const restoreBtn = empty.createEl("button", {
				cls: "cpm-btn is-primary",
				text: "Restore Starter UI Buttons",
			});
			restoreBtn.addEventListener("click", () => void this.restoreDefaultsAndAutoGroup());
			return;
		}

		buttons.forEach((btn, idx) => {
			const row = list.createDiv({ cls: "cpm-flat-card" });
			const left = row.createDiv({ cls: "cpm-row-group cpm-flex-1" });

			const reorderGroup = left.createDiv({ cls: "cpm-reorder-btn-group" });
			const upBtn = reorderGroup.createEl("button", {
				cls: "cpm-icon-btn cpm-btn-micro",
				attr: { disabled: idx === 0 ? "true" : null },
			});
			setIcon(upBtn, "chevron-up");
			upBtn.addEventListener("click", voidAsync(async () => {
				if (idx === 0) return;
				const arr = this.settings.pinnedButtons;
				const prev = arr[idx - 1]!;
				const cur = arr[idx]!;
				arr[idx - 1] = cur;
				arr[idx] = prev;
				await this.saveAndApply(true);
			}));

			const downBtn = reorderGroup.createEl("button", {
				cls: "cpm-icon-btn cpm-btn-micro",
				attr: { disabled: idx >= buttons.length - 1 ? "true" : null },
			});
			setIcon(downBtn, "chevron-down");
			downBtn.addEventListener("click", voidAsync(async () => {
				if (idx >= buttons.length - 1) return;
				const arr = this.settings.pinnedButtons;
				const next = arr[idx + 1]!;
				const cur = arr[idx]!;
				arr[idx + 1] = cur;
				arr[idx] = next;
				await this.saveAndApply(true);
			}));

			const iconBtn = left.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
			const icSpan = iconBtn.createSpan({ cls: "cpm-svg" });
			setIcon(icSpan, btn.icon || "terminal");
			if (btn.color) icSpan.style.color = btn.color;
			iconBtn.createSpan({ text: btn.icon || "terminal" });
			iconBtn.addEventListener("click", () => {
				new VisualIconPickerModal(
					this.app,
					btn.icon,
					voidAsync(async (chosen) => {
						btn.icon = chosen;
						await this.saveAndApply(true);
					}),
				).open();
			});

			const colorIn = left.createEl("input", {
				type: "color",
				value: btn.color || "#00a884",
				cls: "cpm-color-picker",
			});
			setTooltip(colorIn, "Custom icon tint");
			colorIn.addEventListener("change", voidAsync(async () => {
				btn.color = colorIn.value;
				await this.saveAndApply(true);
			}));

			const labelIn = left.createEl("input", {
				type: "text",
				value: btn.label,
				cls: "cpm-name-input",
			});
			labelIn.addEventListener("blur", voidAsync(async () => {
				btn.label = labelIn.value.trim() || btn.commandId;
				await this.saveAndApply(true);
			}));

			const right = row.createDiv({ cls: "cpm-row-group" });

			const locPicker = right.createEl("select", { cls: "cpm-select cpm-select-xs" });
			[
				{ id: "header", label: "Note Header" },
				{ id: "ribbon", label: "Left Ribbon" },
				{ id: "statusbar", label: "Status Bar" },
				{ id: "editor-menu", label: "Editor Context Menu" },
				{ id: "file-menu", label: "File Explorer Menu" },
			].forEach((l) => {
				const opt = locPicker.createEl("option", { text: l.label, value: l.id });
				opt.selected = btn.location === l.id;
			});
			locPicker.addEventListener("change", voidAsync(async () => {
				btn.location = locPicker.value as typeof btn.location;
				await this.saveAndApply(true);
			}));

			const modePicker = right.createEl("select", { cls: "cpm-select cpm-select-xs" });
			[
				{ id: "icon", label: "Icon Only" },
				{ id: "both", label: "Icon + Label" },
			].forEach((m) => {
				const opt = modePicker.createEl("option", { text: m.label, value: m.id });
				opt.selected = (btn.displayMode || "icon") === m.id;
			});
			modePicker.addEventListener("change", voidAsync(async () => {
				btn.displayMode = modePicker.value as typeof btn.displayMode;
				await this.saveAndApply(true);
			}));

			const devPicker = right.createEl("select", { cls: "cpm-select cpm-select-xs" });
			[
				{ id: "all", label: "All Devices" },
				{ id: "desktop", label: "Desktop" },
				{ id: "mobile", label: "Mobile" },
			].forEach((d) => {
				const opt = devPicker.createEl("option", { text: d.label, value: d.id });
				opt.selected = (btn.device || "all") === d.id;
			});
			devPicker.addEventListener("change", voidAsync(async () => {
				btn.device = devPicker.value as typeof btn.device;
				await this.saveAndApply(true);
			}));

			const testBtn = right.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
			setIcon(testBtn.createSpan({ cls: "cpm-svg" }), "play");
			testBtn.createSpan({ text: "Test" });
			testBtn.addEventListener("click", () => {
				this.registry.executeCommandSafe(btn.commandId);
			});

			const delBtn = right.createEl("button", { cls: "cpm-btn cpm-btn-xs is-danger" });
			setIcon(delBtn.createSpan({ cls: "cpm-svg" }), "trash-2");
			delBtn.createSpan({ text: "Remove" });
			delBtn.addEventListener("click", () => {
				this.runDestructive(
					"Remove UI Button?",
					`Remove "${btn.label}" from ${btn.location}?`,
					"Remove",
					async () => {
						this.settings.pinnedButtons.splice(idx, 1);
						await this.saveAndApply(true);
					},
				);
			});
		});
	}

	renderMacrosTab(container: HTMLElement): void {
		const macros = this.settings.macros || [];
		if (!this.activeMacroId && macros.length > 0) {
			this.activeMacroId = macros[0]!.id;
		}

		const tplBar = container.createDiv({ cls: "cpm-bulk-bar" });
		tplBar.createSpan({ cls: "cpm-alias-label", text: "1-Click Starter Templates:" });
		const tplBtns = tplBar.createDiv({ cls: "cpm-row-group" });
		MACRO_TEMPLATES.forEach((tpl) => {
			const b = tplBtns.createEl("button", { cls: "cpm-btn cpm-btn-xs is-tonal" });
			setIcon(b.createSpan({ cls: "cpm-svg" }), tpl.icon);
			b.createSpan({ text: `+ ${tpl.name}` });
			setTooltip(b, tpl.desc);
			b.addEventListener("click", voidAsync(async () => {
				const id = `m-${Date.now()}`;
				this.settings.macros.push({
					id,
					name: tpl.name,
					icon: tpl.icon,
					aliases: [...tpl.aliases],
					loop: tpl.loop || 1,
					steps: tpl.steps.map((s) => ({ ...s })),
				});
				this.activeMacroId = id;
				await this.saveAndApply(true);
			}));
		});

		const chipRow = container.createDiv({ cls: "cpm-chip-strip" });
		macros.forEach((m) => {
			const chip = chipRow.createEl("button", {
				cls: `cpm-chip ${m.id === this.activeMacroId ? "is-active" : ""}`,
			});
			setIcon(chip.createSpan({ cls: "cpm-svg" }), m.icon || "sparkles");
			chip.createSpan({ text: `${m.name} (${(m.steps || []).length})` });
			chip.addEventListener("click", () => {
				this.activeMacroId = m.id;
				this.render();
			});
		});

		const addMacroChip = chipRow.createEl("button", { cls: "cpm-chip is-add-chip" });
		setIcon(addMacroChip.createSpan({ cls: "cpm-svg" }), "plus");
		addMacroChip.createSpan({ text: "New Macro" });
		addMacroChip.addEventListener("click", () => {
			new InputModal(
				this.app,
				"Create New Macro",
				"Macro name...",
				"",
				async (name) => {
					const id = `m-${Date.now()}`;
					this.settings.macros.push({
						id,
						name,
						icon: "sparkles",
						aliases: [],
						loop: 1,
						steps: [],
					});
					this.activeMacroId = id;
					await this.saveAndApply(true);
				},
			).open();
		});

		const activeMacro = macros.find((m) => m.id === this.activeMacroId);
		if (!activeMacro) {
			container.createDiv({
				cls: "cpm-empty",
				text: "Click a 1-Click Starter Template above or '+ New Macro' to chain commands, text snippets, delays, and notices.",
			});
			return;
		}

		const configBar = container.createDiv({ cls: "cpm-toolbar-row" });
		const iconBtn = configBar.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
		setIcon(iconBtn.createSpan({ cls: "cpm-svg" }), activeMacro.icon || "sparkles");
		iconBtn.createSpan({ text: activeMacro.icon || "sparkles" });
		iconBtn.addEventListener("click", () => {
			new VisualIconPickerModal(
				this.app,
				activeMacro.icon,
				voidAsync(async (chosen) => {
					activeMacro.icon = chosen;
					await this.saveAndApply(true);
				}),
			).open();
		});

		const nameIn = configBar.createEl("input", {
			type: "text",
			value: activeMacro.name,
			cls: "cpm-input",
		});
		nameIn.addEventListener("blur", voidAsync(async () => {
			activeMacro.name = nameIn.value.trim() || activeMacro.name;
			await this.saveAndApply(true);
		}));

		const aliasIn = configBar.createEl("input", {
			type: "text",
			placeholder: "Aliases (e.g. sr, clean)",
			value: (activeMacro.aliases || []).join(", "),
			cls: "cpm-input cpm-flex-1",
		});
		aliasIn.addEventListener("blur", voidAsync(async () => {
			activeMacro.aliases = aliasIn.value
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			await this.saveAndApply(false);
		}));

		configBar.createSpan({ cls: "cpm-alias-label", text: "Loop:" });
		const loopIn = configBar.createEl("input", {
			type: "number",
			value: String(activeMacro.loop || 1),
			cls: "cpm-input cpm-num-input",
		});
		loopIn.addEventListener("change", voidAsync(async () => {
			activeMacro.loop = Math.min(25, Math.max(1, Number(loopIn.value) || 1));
			await this.saveAndApply(false);
		}));

		const testBtn = configBar.createEl("button", { cls: "cpm-btn cpm-btn-xs is-primary" });
		setIcon(testBtn.createSpan({ cls: "cpm-svg" }), "play");
		testBtn.createSpan({ text: "Run Macro" });
		testBtn.addEventListener("click", () => {
			void this.plugin.macroEngine.runMacro(activeMacro.id);
		});

		const delMacroBtn = configBar.createEl("button", { cls: "cpm-btn cpm-btn-xs is-danger" });
		setIcon(delMacroBtn.createSpan({ cls: "cpm-svg" }), "trash-2");
		delMacroBtn.createSpan({ text: "Delete" });
		delMacroBtn.addEventListener("click", () => {
			this.runDestructive(
				`Delete Macro "${activeMacro.name}"?`,
				"Permanently delete this macro?",
				"Delete",
				async () => {
					const idx = macros.findIndex((m) => m.id === activeMacro.id);
					if (idx !== -1) macros.splice(idx, 1);
					this.activeMacroId = macros[0]?.id ?? null;
					await this.saveAndApply(true);
				},
			);
		});

		const stepBar = container.createDiv({ cls: "cpm-toolbar-row" });
		const typeSelect = stepBar.createEl("select", { cls: "cpm-select" });
		[
			{ id: "command", label: "Step: Run Command" },
			{ id: "text", label: "Step: Insert Text / Template" },
			{ id: "notice", label: "Step: Toast Notification" },
			{ id: "clipboard", label: "Step: Copy to Clipboard" },
			{ id: "uri", label: "Step: Open URL / URI" },
		].forEach((t) => {
			const opt = typeSelect.createEl("option", { text: t.label, value: t.id });
			opt.selected = this.newStepType === t.id;
		});
		typeSelect.addEventListener("change", () => {
			this.newStepType = typeSelect.value as MacroStepType;
			this.render();
		});

		const allCmds = this.registry.getAllManagedCommands();
		let stepCmdSelect: HTMLSelectElement | null = null;
		let stepTextInput: HTMLInputElement | null = null;

		if (this.newStepType === "command") {
			stepCmdSelect = stepBar.createEl("select", { cls: "cpm-select cpm-flex-1" });
			stepCmdSelect.createEl("option", { text: "Choose command to execute...", value: "" });
			allCmds.forEach((c) => {
				stepCmdSelect!.createEl("option", {
					text: `${c.pluginName}: ${c.currentName}`,
					value: c.id,
				});
			});
		} else {
			const placeholder =
				this.newStepType === "text"
					? "Text to insert (supports {{date}}, {{time}}, {{title}}, {{selection}})..."
					: this.newStepType === "notice"
						? "Toast notice message..."
						: this.newStepType === "clipboard"
							? "Text to copy to clipboard..."
							: "URL or obsidian:// URI to open...";
			stepTextInput = stepBar.createEl("input", {
				type: "text",
				placeholder,
				cls: "cpm-input cpm-flex-1",
			});
		}

		const delayIn = stepBar.createEl("input", {
			type: "number",
			placeholder: "Wait ms",
			value: "80",
			cls: "cpm-input cpm-num-input",
		});

		const addStepBtn = stepBar.createEl("button", { cls: "cpm-btn is-primary" });
		setIcon(addStepBtn.createSpan({ cls: "cpm-svg" }), "plus");
		addStepBtn.createSpan({ text: "Add Step" });
		addStepBtn.addEventListener("click", voidAsync(async () => {
			if (this.newStepType === "command") {
				if (!stepCmdSelect?.value) {
					new Notice("Choose a command first.");
					return;
				}
				activeMacro.steps.push({
					type: "command",
					commandId: stepCmdSelect.value,
					text: "",
					delayMs: Math.max(0, Number(delayIn.value) || 0),
				});
			} else {
				if (!stepTextInput?.value) {
					new Notice("Enter text for this step.");
					return;
				}
				activeMacro.steps.push({
					type: this.newStepType,
					commandId: "",
					text: stepTextInput.value,
					delayMs: Math.max(0, Number(delayIn.value) || 0),
				});
			}
			await this.saveAndApply(true);
		}));

		if (this.newStepType === "text" && stepTextInput) {
			const textInput = stepTextInput;
			const varPills = container.createDiv({ cls: "cpm-var-pills" });
			varPills.createSpan({ text: "Quick Tags: ", cls: "cpm-alias-label" });
			[
				"{{date}}",
				"{{time}}",
				"{{datetime}}",
				"{{title}}",
				"{{selection}}",
				"{{clipboard}}",
			].forEach((tag) => {
				const pill = varPills.createEl("button", {
					cls: "cpm-alias-pill cpm-btn-micro",
					text: tag,
				});
				pill.addEventListener("click", () => {
					textInput.value += tag;
					textInput.focus();
				});
			});
		}

		const stepList = container.createDiv({ cls: "cpm-viewport is-single" });
		(activeMacro.steps || []).forEach((step, sIdx) => {
			const row = stepList.createDiv({ cls: "cpm-flat-card" });
			const left = row.createDiv({ cls: "cpm-row-group cpm-flex-1" });
			left.createSpan({ cls: "cpm-pill-count", text: `#${sIdx + 1}` });

			const typeLabel =
				step.type === "text"
					? "Insert Text"
					: step.type === "notice"
						? "Toast Notice"
						: step.type === "clipboard"
							? "Clipboard"
							: step.type === "uri"
								? "Open URI"
								: "Command";

			left.createSpan({ cls: "cpm-plugin-tag", text: typeLabel });

			if (step.type === "command") {
				const info = allCmds.find((c) => c.id === step.commandId);
				left.createSpan({
					text: info ? `${info.pluginName}: ${info.currentName}` : step.commandId,
				});
			} else {
				left.createSpan({ text: `"${step.text}"` });
			}

			const right = row.createDiv({ cls: "cpm-row-group" });
			right.createSpan({ cls: "cpm-alias-label", text: "Wait (ms):" });
			const dIn = right.createEl("input", {
				type: "number",
				value: String(step.delayMs || 0),
				cls: "cpm-input cpm-num-input",
			});
			dIn.addEventListener("change", voidAsync(async () => {
				step.delayMs = Math.max(0, Number(dIn.value) || 0);
				await this.saveAndApply(false);
			}));

			const upBtn = right.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
			setIcon(upBtn.createSpan({ cls: "cpm-svg" }), "chevron-up");
			upBtn.addEventListener("click", voidAsync(async () => {
				if (sIdx === 0) return;
				const arr = activeMacro.steps;
				const prev = arr[sIdx - 1]!;
				const cur = arr[sIdx]!;
				arr[sIdx - 1] = cur;
				arr[sIdx] = prev;
				await this.saveAndApply(true);
			}));

			const downBtn = right.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
			setIcon(downBtn.createSpan({ cls: "cpm-svg" }), "chevron-down");
			downBtn.addEventListener("click", voidAsync(async () => {
				const arr = activeMacro.steps;
				if (sIdx >= arr.length - 1) return;
				const next = arr[sIdx + 1]!;
				const cur = arr[sIdx]!;
				arr[sIdx + 1] = cur;
				arr[sIdx] = next;
				await this.saveAndApply(true);
			}));

			const delBtn = right.createEl("button", { cls: "cpm-btn cpm-btn-xs is-danger" });
			setIcon(delBtn.createSpan({ cls: "cpm-svg" }), "trash-2");
			delBtn.addEventListener("click", voidAsync(async () => {
				activeMacro.steps.splice(sIdx, 1);
				await this.saveAndApply(true);
			}));
		});
	}
}

export class CommandManagerModal extends Modal {
	constructor(
		app: App,
		public plugin: CommandPaletteManagerPlugin,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("cpm-modal-window");
		const { contentEl } = this;
		contentEl.empty();
		new CommandManagerUI(this.plugin, contentEl, true, () => this.close()).render();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Local debounce for input listeners; avoids exporting the fuzzy helper's generics. */
function debounceInput(fn: () => void, waitMs: number): () => void {
	let timer: number | null = null;
	return () => {
		if (timer) window.clearTimeout(timer);
		timer = window.setTimeout(fn, waitMs);
	};
}
