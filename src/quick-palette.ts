import { Modal, Notice, TFile, normalizePath, setIcon, setTooltip } from "obsidian";
import type { App } from "obsidian";
import { voidAsync } from "./async";
import { fuzzyScore, renderHighlightedText } from "./fuzzy";
import type { CpmSettings, ManagedCommand } from "./types";
import type CommandPaletteManagerPlugin from "./main";

export type QuickPaletteMode = "command" | "file" | "tag";

interface ScoredCommandItem {
	kind: "command";
	cmd: ManagedCommand;
	score: number;
	matchIndices: number[];
}

interface ScoredFileItem {
	kind: "file";
	file: TFile;
	displayName: string;
	score: number;
	matchIndices: number[];
}

interface ScoredTagItem {
	kind: "tag";
	tag: string;
	count: number;
	score: number;
	matchIndices: number[];
}

type RenderedEntry = ScoredCommandItem | ScoredFileItem | ScoredTagItem;

/**
 * Raycast-style unified launcher.
 * Commands (`@group`, `#plugin`, `!macro`, `*pinned`), File Search (`/` prefix or dedicated hotkey),
 * and Tag Search (`##` prefix or dedicated hotkey) with Shift+Enter note creation, Ctrl+Enter new tab,
 * and optional Close on Backspace.
 */
export class QuickCommandPaletteModal extends Modal {
	searchInput!: HTMLInputElement;
	resultsEl!: HTMLElement;
	chipRowEl!: HTMLElement;
	searchQuery = "";
	selectedGroup = "all";
	selectedIndex = 0;
	baseMode: QuickPaletteMode;
	activeTagFilter: string | null = null;
	renderedEntries: RenderedEntry[] = [];

	constructor(
		app: App,
		public plugin: CommandPaletteManagerPlugin,
		initialMode: QuickPaletteMode = "command",
	) {
		super(app);
		this.baseMode = initialMode;
	}

	private resolveEffectiveMode(): { mode: QuickPaletteMode; query: string } {
		const raw = this.searchQuery.trim();
		if (this.activeTagFilter) {
			return { mode: "file", query: raw };
		}
		if (this.baseMode !== "command") {
			return { mode: this.baseMode, query: raw };
		}
		const tagPrefix = (this.plugin.settings.tagSearchPrefix || "##").trim();
		const filePrefix = (this.plugin.settings.fileSearchPrefix || "/").trim();
		if (tagPrefix && raw.startsWith(tagPrefix)) {
			return { mode: "tag", query: raw.slice(tagPrefix.length).trim() };
		}
		if (filePrefix && raw.startsWith(filePrefix)) {
			return { mode: "file", query: raw.slice(filePrefix.length).trim() };
		}
		return { mode: "command", query: raw };
	}

	private getPlaceholder(): string {
		if (this.activeTagFilter) {
			return `Filter notes tagged #${this.activeTagFilter} (Backspace to return)...`;
		}
		if (this.baseMode === "file") {
			return "Search files (Enter open, Ctrl+Enter new tab, Shift+Enter create note)...";
		}
		if (this.baseMode === "tag") {
			return "Search vault tags (Enter to browse notes with tag)...";
		}
		const fp = this.plugin.settings.fileSearchPrefix || "/";
		const tp = this.plugin.settings.tagSearchPrefix || "##";
		return `Command, alias, @group, #plugin, !macro, ${fp}files, or ${tp}tags...`;
	}

	onOpen(): void {
		this.modalEl.addClass("cpm-quick-palette-modal");
		const { contentEl } = this;
		contentEl.empty();

		const searchRow = contentEl.createDiv({ cls: "cpm-qp-search-bar" });
		const searchIcon = searchRow.createSpan({ cls: "cpm-qp-search-icon" });
		setIcon(
			searchIcon,
			this.baseMode === "file" ? "file-text" : this.baseMode === "tag" ? "tag" : "search",
		);

		this.searchInput = searchRow.createEl("input", {
			type: "text",
			placeholder: this.getPlaceholder(),
			cls: "cpm-qp-input",
		});

		const clearBtn = searchRow.createEl("button", { cls: "cpm-icon-btn cpm-qp-clear-btn" });
		setIcon(clearBtn, "x");
		clearBtn.setCssProps({ display: "none" });
		clearBtn.addEventListener("click", () => {
			this.searchInput.value = "";
			this.searchQuery = "";
			this.activeTagFilter = null;
			this.searchInput.placeholder = this.getPlaceholder();
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
		sortSelect.addEventListener(
			"change",
			voidAsync(async () => {
				this.plugin.settings.quickPaletteSort =
					sortSelect.value as CpmSettings["quickPaletteSort"];
				await this.plugin.saveSettings();
				this.renderResults();
			}),
		);

		const mgrBtn = searchRow.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
		setIcon(mgrBtn.createSpan({ cls: "cpm-svg" }), "settings");
		mgrBtn.createSpan({ text: "Manage" });
		setTooltip(mgrBtn, "Open full Command Palette Manager (Alt+M)");
		mgrBtn.addEventListener("click", () => {
			this.close();
			this.plugin.openManager();
		});

		this.chipRowEl = contentEl.createDiv({ cls: "cpm-chip-strip" });
		const groups = [
			"all",
			"Pinned",
			...(this.plugin.settings.actionGroups || []).filter((g) => g !== "Pinned"),
		];
		groups.forEach((g) => {
			const chip = this.chipRowEl.createEl("button", {
				cls: `cpm-chip ${this.selectedGroup === g ? "is-active" : ""}`,
				text: g === "all" ? "All" : g,
			});
			chip.addEventListener("click", () => {
				this.selectedGroup = g;
				this.selectedIndex = 0;
				this.chipRowEl
					.querySelectorAll(".cpm-chip")
					.forEach((el) => el.removeClass("is-active"));
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
		addFooterHint("↵", "Run/Open");
		footer.createSpan({ cls: "cpm-qp-footer-dot", text: "•" });
		addFooterHint("Ctrl+↵", "New Tab");
		footer.createSpan({ cls: "cpm-qp-footer-dot", text: "•" });
		addFooterHint("Shift+↵", "Create Note");
		footer.createSpan({ cls: "cpm-qp-footer-dot", text: "•" });
		addFooterHint("Alt+M", "Manager");

		this.searchInput.addEventListener("input", () => {
			this.searchQuery = this.searchInput.value;
			clearBtn.setCssProps({
				display: this.searchQuery || this.activeTagFilter ? "inline-flex" : "none",
			});
			this.selectedIndex = 0;
			this.renderResults();
		});

		this.searchInput.addEventListener("keydown", (e) => {
			if (e.key === "Backspace" && !this.searchInput.value) {
				if (this.activeTagFilter) {
					e.preventDefault();
					this.activeTagFilter = null;
					this.searchInput.placeholder = this.getPlaceholder();
					this.selectedIndex = 0;
					this.renderResults();
					return;
				}
				if (this.plugin.settings.closeOnBackspace !== false) {
					e.preventDefault();
					this.close();
					return;
				}
			}

			if (e.key === "ArrowDown") {
				e.preventDefault();
				if (this.renderedEntries.length > 0) {
					this.selectedIndex = (this.selectedIndex + 1) % this.renderedEntries.length;
					this.updateHighlight();
				}
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				if (this.renderedEntries.length > 0) {
					this.selectedIndex =
						(this.selectedIndex - 1 + this.renderedEntries.length) %
						this.renderedEntries.length;
					this.updateHighlight();
				}
			} else if (e.key === "PageDown") {
				e.preventDefault();
				if (this.renderedEntries.length > 0) {
					this.selectedIndex = Math.min(
						this.renderedEntries.length - 1,
						this.selectedIndex + 8,
					);
					this.updateHighlight();
				}
			} else if (e.key === "PageUp") {
				e.preventDefault();
				if (this.renderedEntries.length > 0) {
					this.selectedIndex = Math.max(0, this.selectedIndex - 8);
					this.updateHighlight();
				}
			} else if (e.key === "Home") {
				e.preventDefault();
				if (this.renderedEntries.length > 0) {
					this.selectedIndex = 0;
					this.updateHighlight();
				}
			} else if (e.key === "End") {
				e.preventDefault();
				if (this.renderedEntries.length > 0) {
					this.selectedIndex = this.renderedEntries.length - 1;
					this.updateHighlight();
				}
			} else if (e.key === "Enter") {
				e.preventDefault();
				void this.activateSelection(e);
			} else if (e.altKey && e.key.toLowerCase() === "m") {
				e.preventDefault();
				this.close();
				this.plugin.openManager();
			}
		});

		this.renderResults();
		window.setTimeout(() => this.searchInput.focus(), 30);
	}

	private async activateSelection(e: KeyboardEvent | MouseEvent, explicit?: RenderedEntry): Promise<void> {
		const { mode, query } = this.resolveEffectiveMode();
		const modsEnabled = this.plugin.settings.createAndOpenModifiers !== false;
		const openInNewTab = modsEnabled && (e.ctrlKey || e.metaKey);
		const wantsCreate = modsEnabled && e.shiftKey;

		if (mode === "file" && wantsCreate && query) {
			await this.createAndOpenNote(query, openInNewTab);
			return;
		}

		const chosen = explicit ?? this.renderedEntries[this.selectedIndex];
		if (!chosen) {
			if (mode === "file" && query) {
				await this.createAndOpenNote(query, openInNewTab);
			}
			return;
		}

		if (chosen.kind === "command") {
			this.close();
			this.plugin.registry.executeCommandSafe(chosen.cmd.id);
		} else if (chosen.kind === "file") {
			this.close();
			const leaf = this.app.workspace.getLeaf(openInNewTab ? "tab" : false);
			await leaf.openFile(chosen.file);
		} else if (chosen.kind === "tag") {
			this.activeTagFilter = chosen.tag;
			this.searchInput.value = "";
			this.searchQuery = "";
			this.searchInput.placeholder = this.getPlaceholder();
			this.selectedIndex = 0;
			this.renderResults();
			this.searchInput.focus();
		}
	}

	private async createAndOpenNote(rawName: string, inNewTab: boolean): Promise<void> {
		const cleaned = rawName.trim().replace(/^\/+/, "");
		if (!cleaned) return;
		const path = normalizePath(cleaned.endsWith(".md") ? cleaned : `${cleaned}.md`);
		const existing = this.app.vault.getAbstractFileByPath(path);
		let file: TFile;
		if (existing instanceof TFile) {
			file = existing;
		} else {
			const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
			if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
				await this.app.vault.createFolder(folder);
			}
			file = await this.app.vault.create(path, "");
			new Notice(`Created note: ${file.path}`);
		}
		this.close();
		const leaf = this.app.workspace.getLeaf(inNewTab ? "tab" : false);
		await leaf.openFile(file);
	}

	renderResults(): void {
		this.resultsEl.empty();
		const { mode, query } = this.resolveEffectiveMode();
		const limit = Math.max(10, Math.min(250, this.plugin.settings.suggestionLimit || 90));
		this.chipRowEl.setCssProps({ display: mode === "command" ? "flex" : "none" });

		if (mode === "file") {
			this.renderFileResults(query, limit);
			return;
		}
		if (mode === "tag") {
			this.renderTagResults(query, limit);
			return;
		}
		this.renderCommandResults(query, limit);
	}

	private collectFileTags(file: TFile): Set<string> {
		const cache = this.app.metadataCache.getFileCache(file);
		const tags = new Set<string>();
		for (const t of cache?.tags ?? []) {
			tags.add(t.tag.replace(/^#/, ""));
		}
		const fm: unknown = cache?.frontmatter ? Reflect.get(cache.frontmatter, "tags") : undefined;
		if (Array.isArray(fm)) {
			for (const t of fm) {
				if (typeof t === "string" && t.trim()) tags.add(t.trim().replace(/^#/, ""));
			}
		} else if (typeof fm === "string" && fm.trim()) {
			tags.add(fm.trim().replace(/^#/, ""));
		}
		return tags;
	}

	private renderFileResults(query: string, limit: number): void {
		const excluded = new Set(
			(this.plugin.settings.fileTypeExclusions || []).map((ext) =>
				ext.trim().toLowerCase().replace(/^\./, ""),
			),
		);
		const hideMd = this.plugin.settings.hideMdExtension !== false;
		const files = this.app.vault.getFiles().filter((file) => {
			if (excluded.has(file.extension.toLowerCase())) return false;
			if (this.activeTagFilter) {
				const tags = this.collectFileTags(file);
				const target = this.activeTagFilter.toLowerCase();
				let matched = false;
				for (const t of tags) {
					const tl = t.toLowerCase();
					if (tl === target || tl.startsWith(`${target}/`)) {
						matched = true;
						break;
					}
				}
				if (!matched) return false;
			}
			return true;
		});

		const scored: ScoredFileItem[] = [];
		for (const file of files) {
			const displayName =
				hideMd && file.extension.toLowerCase() === "md"
					? file.path.slice(0, -3)
					: file.path;
			if (!query) {
				scored.push({
					kind: "file",
					file,
					displayName,
					score: file.stat.mtime,
					matchIndices: [],
				});
				continue;
			}
			const res = fuzzyScore(query, displayName);
			if (res.match) {
				scored.push({
					kind: "file",
					file,
					displayName,
					score: res.score,
					matchIndices: res.indices,
				});
			}
		}

		scored.sort((a, b) =>
			query ? b.score - a.score : b.file.stat.mtime - a.file.stat.mtime,
		);
		const slice = scored.slice(0, limit);
		this.renderedEntries = slice;

		if (slice.length === 0) {
			const hint = query
				? `No files match "${query}". Press Shift+Enter to create "${query}.md".`
				: "No files found.";
			this.resultsEl.createDiv({ cls: "cpm-empty", text: hint });
			return;
		}

		slice.forEach((entry, idx) => {
			const row = this.resultsEl.createDiv({
				cls: `cpm-qp-row ${idx === this.selectedIndex ? "is-active" : ""}`,
			});
			const left = row.createDiv({ cls: "cpm-qp-main" });
			const iconEl = left.createSpan({ cls: "cpm-qp-cmd-icon" });
			setIcon(iconEl, entry.file.extension.toLowerCase() === "md" ? "file-text" : "file");

			if (this.activeTagFilter) {
				left.createSpan({ cls: "cpm-plugin-tag", text: `#${this.activeTagFilter}` });
			} else if (entry.file.parent && entry.file.parent.path !== "/") {
				left.createSpan({ cls: "cpm-plugin-tag", text: entry.file.parent.path });
			}

			const titleSpan = left.createSpan({ cls: "cpm-qp-title" });
			renderHighlightedText(titleSpan, entry.displayName, entry.matchIndices);

			const right = row.createDiv({ cls: "cpm-qp-meta" });
			if (entry.file.extension.toLowerCase() !== "md") {
				right.createSpan({
					cls: "cpm-alias-pill",
					text: entry.file.extension.toUpperCase(),
				});
			}

			row.addEventListener("click", (evt) => {
				void this.activateSelection(evt, entry);
			});
		});
	}

	private renderTagResults(query: string, limit: number): void {
		const counts = new Map<string, number>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			for (const tag of this.collectFileTags(file)) {
				counts.set(tag, (counts.get(tag) ?? 0) + 1);
			}
		}

		const scored: ScoredTagItem[] = [];
		for (const [tag, count] of counts.entries()) {
			if (!query) {
				scored.push({ kind: "tag", tag, count, score: count, matchIndices: [] });
				continue;
			}
			const res = fuzzyScore(query, tag);
			if (res.match) {
				scored.push({
					kind: "tag",
					tag,
					count,
					score: res.score,
					matchIndices: res.indices,
				});
			}
		}

		scored.sort((a, b) =>
			query ? b.score - a.score : b.count - a.count || a.tag.localeCompare(b.tag),
		);
		const slice = scored.slice(0, limit);
		this.renderedEntries = slice;

		if (slice.length === 0) {
			this.resultsEl.createDiv({ cls: "cpm-empty", text: "No matching tags found." });
			return;
		}

		slice.forEach((entry, idx) => {
			const row = this.resultsEl.createDiv({
				cls: `cpm-qp-row ${idx === this.selectedIndex ? "is-active" : ""}`,
			});
			const left = row.createDiv({ cls: "cpm-qp-main" });
			const iconEl = left.createSpan({ cls: "cpm-qp-cmd-icon" });
			setIcon(iconEl, "tag");

			const titleSpan = left.createSpan({ cls: "cpm-qp-title" });
			renderHighlightedText(titleSpan, `#${entry.tag}`, entry.matchIndices.map((i) => i + 1));

			const right = row.createDiv({ cls: "cpm-qp-meta" });
			right.createSpan({
				cls: "cpm-usage-tag",
				text: `${entry.count} ${entry.count === 1 ? "note" : "notes"}`,
			});

			row.addEventListener("click", (evt) => {
				void this.activateSelection(evt, entry);
			});
		});
	}

	private renderCommandResults(rawQuery: string, limit: number): void {
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
		const recentAbovePinned = Boolean(this.plugin.settings.recentAbovePinned);
		const all = this.plugin.registry.getAllManagedCommands().filter((c) => !c.hidden);

		const scoredItems: ScoredCommandItem[] = [];

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
				scoredItems.push({ kind: "command", cmd: c, score: 0, matchIndices: [] });
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
				scoredItems.push({ kind: "command", cmd: c, score: bestScore, matchIndices });
			}
		});

		scoredItems.sort((a, b) => {
			if (recentAbovePinned && !cleanQuery) {
				const aRecent = recents.indexOf(a.cmd.id);
				const bRecent = recents.indexOf(b.cmd.id);
				if (aRecent !== -1 || bRecent !== -1) {
					if (aRecent === -1) return 1;
					if (bRecent === -1) return -1;
					return aRecent - bRecent;
				}
			}

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

		const slice = scoredItems.slice(0, limit);
		this.renderedEntries = slice;

		if (slice.length === 0) {
			this.resultsEl.createDiv({
				cls: "cpm-empty",
				text: "No matching commands found. Try another keyword, @group, #plugin, !macro, /files, or ##tags.",
			});
			return;
		}

		slice.forEach((entry, idx) => {
			const { cmd, matchIndices } = entry;
			const row = this.resultsEl.createDiv({
				cls: `cpm-qp-row ${idx === this.selectedIndex ? "is-active" : ""}`,
			});

			const starBtn = row.createEl("button", {
				cls: `cpm-icon-btn ${cmd.pinned ? "is-starred" : ""}`,
			});
			setIcon(starBtn, "star");
			setTooltip(starBtn, cmd.pinned ? "Unstar command" : "Star to pin at top");
			starBtn.addEventListener(
				"click",
				voidAsync(async (evt) => {
					evt.stopPropagation();
					const override = this.plugin.registry.ensureOverrideEntry(cmd.id);
					override.pinned = !cmd.pinned;
					await this.plugin.saveSettings();
					this.renderResults();
					this.searchInput.focus();
				}),
			);

			const left = row.createDiv({ cls: "cpm-qp-main" });
			const cmdIcon = left.createSpan({ cls: "cpm-qp-cmd-icon" });
			setIcon(cmdIcon, cmd.icon || "terminal");

			if (this.plugin.settings.showPluginBadges !== false) {
				left.createSpan({ cls: "cpm-plugin-tag", text: cmd.pluginName });
			}

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
			if (this.plugin.settings.showHotkeys !== false && cmd.hotkey) {
				right.createSpan({ cls: "cpm-kbd-badge", text: cmd.hotkey });
			}

			row.addEventListener("click", (evt) => {
				void this.activateSelection(evt, entry);
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
