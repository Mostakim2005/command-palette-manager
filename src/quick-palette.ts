import { Modal, setIcon, setTooltip } from "obsidian";
import type { App } from "obsidian";
import { voidAsync } from "./async";
import { fuzzyScore, renderHighlightedText } from "./fuzzy";
import type { CpmSettings, ManagedCommand } from "./types";
import type CommandPaletteManagerPlugin from "./main";

interface ScoredItem {
	cmd: ManagedCommand;
	score: number;
	matchIndices: number[];
}

/**
 * Raycast-style launcher.
 * Supports `@group`, `#plugin`, `!macro`, `*pinned` prefix operators,
 * full keyboard navigation and inline starring.
 */
export class QuickCommandPaletteModal extends Modal {
	searchInput!: HTMLInputElement;
	resultsEl!: HTMLElement;
	searchQuery = "";
	selectedGroup = "all";
	selectedIndex = 0;
	renderedItems: ManagedCommand[] = [];

	constructor(
		app: App,
		public plugin: CommandPaletteManagerPlugin,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("cpm-quick-palette-modal");
		const { contentEl } = this;
		contentEl.empty();

		const searchRow = contentEl.createDiv({ cls: "cpm-qp-search-bar" });
		const searchIcon = searchRow.createSpan({ cls: "cpm-qp-search-icon" });
		setIcon(searchIcon, "search");

		this.searchInput = searchRow.createEl("input", {
			type: "text",
			placeholder: "Type command, alias, @group, #plugin, or !macro...",
			cls: "cpm-qp-input",
		});

		const clearBtn = searchRow.createEl("button", { cls: "cpm-icon-btn cpm-qp-clear-btn" });
		setIcon(clearBtn, "x");
		clearBtn.setCssProps({ display: "none" });
		clearBtn.addEventListener("click", () => {
			this.searchInput.value = "";
			this.searchQuery = "";
			clearBtn.setCssProps({ display: "none" });
			this.renderResults();
			this.searchInput.focus();
		});

		const sortSelect = searchRow.createEl("select", { cls: "cpm-select cpm-select-xs" });
		[
			{ id: "frequency", label: "Sort: Most Used" },
			{ id: "recent", label: "Sort: Recent" },
			{ id: "pinned", label: "Sort: Starred First" },
			{ id: "alpha", label: "Sort: A-Z" },
		].forEach((s) => {
			const opt = sortSelect.createEl("option", { text: s.label, value: s.id });
			opt.selected = (this.plugin.settings.quickPaletteSort || "frequency") === s.id;
		});
		sortSelect.addEventListener("change", voidAsync(async () => {
			this.plugin.settings.quickPaletteSort =
				sortSelect.value as CpmSettings["quickPaletteSort"];
			await this.plugin.saveSettings();
			this.renderResults();
		}));

		const mgrBtn = searchRow.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
		setIcon(mgrBtn.createSpan({ cls: "cpm-svg" }), "settings");
		mgrBtn.createSpan({ text: "Manage" });
		setTooltip(mgrBtn, "Open full Command Palette Manager (Alt+M)");
		mgrBtn.addEventListener("click", () => {
			this.close();
			this.plugin.openManager();
		});

		const chipRow = contentEl.createDiv({ cls: "cpm-chip-strip" });
		const groups = [
			"all",
			"Pinned",
			...(this.plugin.settings.actionGroups || []).filter((g) => g !== "Pinned"),
		];
		groups.forEach((g) => {
			const chip = chipRow.createEl("button", {
				cls: `cpm-chip ${this.selectedGroup === g ? "is-active" : ""}`,
				text: g === "all" ? "All" : g,
			});
			chip.addEventListener("click", () => {
				this.selectedGroup = g;
				this.selectedIndex = 0;
				chipRow.querySelectorAll(".cpm-chip").forEach((el) => el.removeClass("is-active"));
				chip.addClass("is-active");
				this.renderResults();
				this.searchInput.focus();
			});
		});

		this.resultsEl = contentEl.createDiv({ cls: "cpm-qp-results" });

		const footer = contentEl.createDiv({ cls: "cpm-qp-footer" });
		const addFooterHint = (keyText: string, labelText: string) => {
			const item = footer.createSpan({ cls: "cpm-qp-footer-item" });
			item.createEl("strong", { text: keyText });
			item.createSpan({ text: ` ${labelText}` });
		};
		addFooterHint("↑↓", "Navigate");
		footer.createSpan({ cls: "cpm-qp-footer-dot", text: "•" });
		addFooterHint("↵", "Execute");
		footer.createSpan({ cls: "cpm-qp-footer-dot", text: "•" });
		addFooterHint("★", "Star/Pin");
		footer.createSpan({ cls: "cpm-qp-footer-dot", text: "•" });
		addFooterHint("Alt+M", "Manager");
		footer.createSpan({ cls: "cpm-qp-footer-dot", text: "•" });
		addFooterHint("Esc", "Close");

		this.searchInput.addEventListener("input", () => {
			this.searchQuery = this.searchInput.value;
			clearBtn.setCssProps({ display: this.searchQuery ? "inline-flex" : "none" });
			this.selectedIndex = 0;
			this.renderResults();
		});

		this.searchInput.addEventListener("keydown", (e) => {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				if (this.renderedItems.length > 0) {
					this.selectedIndex = (this.selectedIndex + 1) % this.renderedItems.length;
					this.updateHighlight();
				}
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				if (this.renderedItems.length > 0) {
					this.selectedIndex =
						(this.selectedIndex - 1 + this.renderedItems.length) %
						this.renderedItems.length;
					this.updateHighlight();
				}
			} else if (e.key === "PageDown") {
				e.preventDefault();
				if (this.renderedItems.length > 0) {
					this.selectedIndex = Math.min(
						this.renderedItems.length - 1,
						this.selectedIndex + 8,
					);
					this.updateHighlight();
				}
			} else if (e.key === "PageUp") {
				e.preventDefault();
				if (this.renderedItems.length > 0) {
					this.selectedIndex = Math.max(0, this.selectedIndex - 8);
					this.updateHighlight();
				}
			} else if (e.key === "Home") {
				e.preventDefault();
				if (this.renderedItems.length > 0) {
					this.selectedIndex = 0;
					this.updateHighlight();
				}
			} else if (e.key === "End") {
				e.preventDefault();
				if (this.renderedItems.length > 0) {
					this.selectedIndex = this.renderedItems.length - 1;
					this.updateHighlight();
				}
			} else if (e.key === "Enter") {
				e.preventDefault();
				const chosen = this.renderedItems[this.selectedIndex];
				if (chosen) {
					this.close();
					this.plugin.registry.executeCommandSafe(chosen.id);
				}
			} else if (e.altKey && e.key.toLowerCase() === "m") {
				e.preventDefault();
				this.close();
				this.plugin.openManager();
			}
		});

		this.renderResults();
		window.setTimeout(() => this.searchInput.focus(), 30);
	}

	renderResults(): void {
		this.resultsEl.empty();
		let rawQuery = this.searchQuery.trim();
		let filterOperator = "";
		let operatorParam = "";
		let cleanQuery = rawQuery;

		// Raycast-style prefix operators (@group, #plugin, !macro, *pinned).
		if (rawQuery.startsWith("@")) {
			filterOperator = "@";
			const parts = rawQuery.slice(1).split(" ");
			operatorParam = (parts[0] ?? "").toLowerCase();
			cleanQuery = parts.slice(1).join(" ").trim();
		} else if (rawQuery.startsWith("#")) {
			filterOperator = "#";
			const parts = rawQuery.slice(1).split(" ");
			operatorParam = (parts[0] ?? "").toLowerCase();
			cleanQuery = parts.slice(1).join(" ").trim();
		} else if (rawQuery.startsWith("!")) {
			filterOperator = "!";
			cleanQuery = rawQuery.slice(1).trim();
		} else if (rawQuery.startsWith("*") || rawQuery.startsWith("★")) {
			filterOperator = "*";
			cleanQuery = rawQuery.slice(1).trim();
		}

		const recents = this.plugin.settings.recentCommandIds || [];
		const stats = this.plugin.settings.commandStats || {};
		const sortMode = this.plugin.settings.quickPaletteSort || "frequency";
		const all = this.plugin.registry.getAllManagedCommands().filter((c) => !c.hidden);

		const scoredItems: ScoredItem[] = [];

		all.forEach((c) => {
			if (this.selectedGroup === "Pinned" && !c.pinned && c.group !== "Pinned") return;
			if (
				this.selectedGroup !== "all" &&
				this.selectedGroup !== "Pinned" &&
				c.group !== this.selectedGroup
			) {
				return;
			}

			if (filterOperator === "@" && operatorParam) {
				if (!c.group.toLowerCase().includes(operatorParam)) return;
			} else if (filterOperator === "#" && operatorParam) {
				if (
					!c.pluginName.toLowerCase().includes(operatorParam) &&
					!c.pluginId.toLowerCase().includes(operatorParam)
				) {
					return;
				}
			} else if (filterOperator === "!") {
				if (!c.id.startsWith("macro:") && !c.id.includes(":macro-")) return;
			} else if (filterOperator === "*") {
				if (!c.pinned) return;
			}

			if (!cleanQuery) {
				scoredItems.push({ cmd: c, score: 0, matchIndices: [] });
				return;
			}

			const nameScore = fuzzyScore(cleanQuery, c.currentName);
			let bestScore = nameScore.match ? nameScore.score : -1;
			const matchIndices = nameScore.match ? nameScore.indices : [];

			for (const al of c.aliases) {
				const alScore = fuzzyScore(cleanQuery, al);
				if (alScore.match && alScore.score + 100 > bestScore) {
					bestScore = alScore.score + 100;
				}
			}

			if (bestScore < 0) {
				const plugScore = fuzzyScore(cleanQuery, c.pluginName);
				if (plugScore.match) {
					bestScore = plugScore.score * 0.7;
				}
			}

			if (bestScore >= 0) {
				scoredItems.push({ cmd: c, score: bestScore, matchIndices });
			}
		});

		scoredItems.sort((a, b) => {
			if (a.cmd.pinned !== b.cmd.pinned) return a.cmd.pinned ? -1 : 1;

			if (cleanQuery) {
				if (Math.abs(a.score - b.score) > 10) {
					return b.score - a.score;
				}
			}

			if (sortMode === "frequency") {
				const aRuns = stats[a.cmd.id]?.runs || 0;
				const bRuns = stats[b.cmd.id]?.runs || 0;
				if (aRuns !== bRuns) return bRuns - aRuns;
			} else if (sortMode === "recent") {
				const aRecent = recents.indexOf(a.cmd.id);
				const bRecent = recents.indexOf(b.cmd.id);
				if (aRecent !== -1 || bRecent !== -1) {
					if (aRecent === -1) return 1;
					if (bRecent === -1) return -1;
					return aRecent - bRecent;
				}
			}

			return a.cmd.currentName.localeCompare(b.cmd.currentName);
		});

		this.renderedItems = scoredItems.slice(0, 90).map((x) => x.cmd);

		if (this.renderedItems.length === 0) {
			this.resultsEl.createDiv({
				cls: "cpm-empty",
				text: "No matching commands found. Try typing another keyword, @group, #plugin, or !macro.",
			});
			return;
		}

		scoredItems.slice(0, 90).forEach(({ cmd, matchIndices }, idx) => {
			const row = this.resultsEl.createDiv({
				cls: `cpm-qp-row ${idx === this.selectedIndex ? "is-active" : ""}`,
			});

			const starBtn = row.createEl("button", {
				cls: `cpm-icon-btn ${cmd.pinned ? "is-starred" : ""}`,
			});
			setIcon(starBtn, "star");
			setTooltip(starBtn, cmd.pinned ? "Unstar command" : "Star to pin at top");
			starBtn.addEventListener("click", voidAsync(async (evt) => {
				evt.stopPropagation();
				const entry = this.plugin.registry.ensureOverrideEntry(cmd.id);
				entry.pinned = !cmd.pinned;
				await this.plugin.saveSettings();
				this.renderResults();
				this.searchInput.focus();
			}));

			const left = row.createDiv({ cls: "cpm-qp-main" });
			const cmdIcon = left.createSpan({ cls: "cpm-qp-cmd-icon" });
			setIcon(cmdIcon, cmd.icon || "terminal");

			left.createSpan({ cls: "cpm-plugin-tag", text: cmd.pluginName });

			const titleSpan = left.createSpan({ cls: "cpm-qp-title" });
			renderHighlightedText(titleSpan, cmd.currentName, matchIndices);

			const usage = stats[cmd.id];
			if (usage?.runs && usage.runs > 0) {
				left.createSpan({ cls: "cpm-usage-tag", text: `${usage.runs}x` });
			} else if (recents.includes(cmd.id) && !cmd.pinned) {
				left.createSpan({ cls: "cpm-recent-tag", text: "Recent" });
			}

			const right = row.createDiv({ cls: "cpm-qp-meta" });
			cmd.aliases.forEach((al) => {
				right.createSpan({ cls: "cpm-alias-pill", text: al });
			});
			if (cmd.hotkey) {
				right.createSpan({ cls: "cpm-kbd-badge", text: cmd.hotkey });
			}

			row.addEventListener("click", () => {
				this.close();
				this.plugin.registry.executeCommandSafe(cmd.id);
			});
		});
	}

	updateHighlight(): void {
		const rows = this.resultsEl.querySelectorAll<HTMLElement>(".cpm-qp-row");
		rows.forEach((r, idx) => {
			r.toggleClass("is-active", idx === this.selectedIndex);
			if (idx === this.selectedIndex) {
				r.scrollIntoView({ block: "nearest" });
			}
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
