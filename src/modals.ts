import { Modal, Notice, setIcon } from "obsidian";
import type { App } from "obsidian";
import { voidAsync } from "./async";
import { debounce } from "./fuzzy";
import { VISUAL_ICONS } from "./settings";
import type CommandPaletteManagerPlugin from "./main";

/**
 * Interactive text prompt used by `{{prompt:Label}}` macro expansion.
 * Resolves `null` when the user cancels, so the macro can abort cleanly.
 */
export class TextPromptModal extends Modal {
	submitted = false;
	result: string | null = null;
	private resolvePromise!: (value: string | null) => void;
	readonly promise: Promise<string | null>;

	constructor(
		app: App,
		public promptLabel: string,
		public defaultValue = "",
	) {
		super(app);
		this.promise = new Promise<string | null>((resolve) => {
			this.resolvePromise = resolve;
		});
	}

	onOpen(): void {
		this.modalEl.addClass("cpm-dialog-modal");
		const { contentEl } = this;
		contentEl.empty();

		const header = contentEl.createDiv({ cls: "cpm-dialog-header" });
		const iconSpan = header.createSpan({ cls: "cpm-dialog-warn-icon" });
		setIcon(iconSpan, "terminal");
		header.createEl("h3", { text: this.promptLabel || "Macro Input Required" });

		const body = contentEl.createDiv({ cls: "cpm-dialog-body" });
		const input = body.createEl("input", {
			type: "text",
			value: this.defaultValue,
			cls: "cpm-input cpm-w-full",
		});
		input.placeholder = "Type your response here...";

		const footer = contentEl.createDiv({ cls: "cpm-dialog-footer" });
		const cancelBtn = footer.createEl("button", { cls: "cpm-btn", text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		const okBtn = footer.createEl("button", {
			cls: "cpm-btn is-primary",
			text: "Continue",
		});
		const submit = () => {
			this.submitted = true;
			this.result = input.value;
			this.close();
		};

		okBtn.addEventListener("click", submit);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				submit();
			} else if (e.key === "Escape") {
				this.close();
			}
		});

		window.setTimeout(() => {
			input.focus();
			input.select();
		}, 40);
	}

	onClose(): void {
		if (!this.submitted) {
			this.resolvePromise(null);
		} else {
			this.resolvePromise(this.result);
		}
	}

	waitForResponse(): Promise<string | null> {
		return this.promise;
	}
}

export class ConfirmModal extends Modal {
	constructor(
		app: App,
		public titleText: string,
		public message: string,
		public confirmText = "Confirm",
		public onConfirm: () => void | Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("cpm-dialog-modal");
		const { contentEl } = this;
		contentEl.empty();

		const header = contentEl.createDiv({ cls: "cpm-dialog-header" });
		const warnIcon = header.createSpan({ cls: "cpm-dialog-warn-icon" });
		setIcon(warnIcon, "alert-triangle");
		header.createEl("h3", { text: this.titleText });

		const closeBtn = header.createEl("button", { cls: "cpm-icon-btn cpm-modal-close-head" });
		setIcon(closeBtn, "x");
		closeBtn.addEventListener("click", () => this.close());

		contentEl.createEl("p", { text: this.message, cls: "cpm-dialog-msg" });

		const actions = contentEl.createDiv({ cls: "cpm-dialog-actions" });
		const cancelBtn = actions.createEl("button", { text: "Cancel", cls: "cpm-btn" });
		cancelBtn.addEventListener("click", () => this.close());

		const confirmBtn = actions.createEl("button", {
			text: this.confirmText,
			cls: "cpm-btn is-danger",
		});
		confirmBtn.addEventListener("click", voidAsync(async () => {
			this.close();
			await this.onConfirm();
		}));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export class InputModal extends Modal {
	constructor(
		app: App,
		public titleText: string,
		public placeholder: string,
		public initialValue = "",
		public onSubmit: (value: string) => void | Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("cpm-dialog-modal");
		const { contentEl } = this;
		contentEl.empty();

		const header = contentEl.createDiv({ cls: "cpm-modal-head" });
		header.createEl("h3", { text: this.titleText, cls: "cpm-dialog-title" });
		const closeBtn = header.createEl("button", { cls: "cpm-icon-btn cpm-modal-close-head" });
		setIcon(closeBtn, "x");
		closeBtn.addEventListener("click", () => this.close());

		const input = contentEl.createEl("input", {
			type: "text",
			placeholder: this.placeholder,
			value: this.initialValue,
			cls: "cpm-input cpm-w-full",
		});

		const actions = contentEl.createDiv({ cls: "cpm-dialog-actions" });
		actions
			.createEl("button", { text: "Cancel", cls: "cpm-btn" })
			.addEventListener("click", () => this.close());
		const saveBtn = actions.createEl("button", { text: "Save", cls: "cpm-btn is-primary" });

		const submit = () => {
			const val = input.value.trim();
			if (val) {
				this.close();
				void this.onSubmit(val);
			}
		};
		saveBtn.addEventListener("click", submit);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") submit();
		});
		window.setTimeout(() => input.focus(), 40);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Category-based Lucide icon browser with live custom-icon preview. */
export class VisualIconPickerModal extends Modal {
	searchQuery = "";
	selectedCat = "All";

	constructor(
		app: App,
		public currentIcon: string,
		public onSelect: (iconId: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("cpm-icon-picker-modal");
		const { contentEl } = this;
		contentEl.empty();

		const top = contentEl.createDiv({ cls: "cpm-modal-head" });
		top.createEl("h3", { text: "Choose Lucide Visual Icon" });
		const closeBtn = top.createEl("button", { cls: "cpm-icon-btn" });
		setIcon(closeBtn, "x");
		closeBtn.addEventListener("click", () => this.close());

		const searchRow = contentEl.createDiv({ cls: "cpm-toolbar-row" });
		const search = searchRow.createEl("input", {
			type: "search",
			placeholder: "Filter built-in icons...",
			cls: "cpm-input cpm-flex-1",
		});

		const customInput = searchRow.createEl("input", {
			type: "text",
			placeholder: "Custom Lucide icon ID...",
			cls: "cpm-input cpm-flex-1",
		});

		const customPreview = searchRow.createDiv({ cls: "cpm-icon-custom-preview" });
		setIcon(customPreview, this.currentIcon || "terminal");

		const applyCustomBtn = searchRow.createEl("button", {
			cls: "cpm-btn is-tonal cpm-btn-xs",
			text: "Apply",
		});
		applyCustomBtn.addEventListener("click", () => {
			const val = customInput.value.trim().toLowerCase();
			if (val) {
				this.close();
				this.onSelect(val);
			}
		});

		customInput.addEventListener("input", () => {
			const val = customInput.value.trim().toLowerCase();
			if (val) {
				customPreview.empty();
				try {
					setIcon(customPreview, val);
				} catch {
					setIcon(customPreview, "alert-circle");
				}
			}
		});

		const categories = ["All", "Editing", "Files", "Navigation", "Media", "Tools"];
		const catBar = contentEl.createDiv({ cls: "cpm-chip-strip" });
		categories.forEach((cat) => {
			const chip = catBar.createEl("button", {
				cls: `cpm-chip ${this.selectedCat === cat ? "is-active" : ""}`,
				text: cat,
			});
			chip.addEventListener("click", () => {
				this.selectedCat = cat;
				catBar.querySelectorAll(".cpm-chip").forEach((el) => el.removeClass("is-active"));
				chip.addClass("is-active");
				renderIcons();
			});
		});

		const grid = contentEl.createDiv({ cls: "cpm-icon-grid" });

		const renderIcons = () => {
			grid.empty();
			const q = this.searchQuery.trim().toLowerCase();
			VISUAL_ICONS.filter((ic) => {
				if (this.selectedCat !== "All" && ic.cat !== this.selectedCat) return false;
				if (!q) return true;
				return ic.label.toLowerCase().includes(q) || ic.id.toLowerCase().includes(q);
			}).forEach((ic) => {
				const card = grid.createEl("button", {
					cls: `cpm-icon-tile ${this.currentIcon === ic.id ? "is-active" : ""}`,
				});
				const iconBox = card.createDiv({ cls: "cpm-icon-tile-svg" });
				setIcon(iconBox, ic.id);
				card.createSpan({ cls: "cpm-icon-tile-label", text: ic.label });
				card.addEventListener("click", () => {
					this.close();
					this.onSelect(ic.id);
				});
			});
		};

		search.addEventListener("input", () => {
			this.searchQuery = search.value;
			renderIcons();
		});

		renderIcons();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Bulk-assignment modal used by the Groups tab. */
export class AssignCommandsToGroupModal extends Modal {
	searchQuery = "";

	constructor(
		app: App,
		public plugin: CommandPaletteManagerPlugin,
		public groupName: string,
		public onDone: (() => void) | null = null,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("cpm-assign-modal");
		const { contentEl } = this;
		contentEl.empty();

		const top = contentEl.createDiv({ cls: "cpm-modal-head" });
		top.createEl("h3", { text: `Assign Commands to "${this.groupName}"` });
		const closeBtn = top.createEl("button", { cls: "cpm-icon-btn" });
		setIcon(closeBtn, "x");
		closeBtn.addEventListener("click", () => this.close());

		const search = contentEl.createEl("input", {
			type: "search",
			placeholder: "Search commands by name or plugin...",
			cls: "cpm-input cpm-w-full",
		});

		const listEl = contentEl.createDiv({ cls: "cpm-assign-list" });

		const renderList = () => {
			listEl.empty();
			const q = this.searchQuery.trim().toLowerCase();
			const all = this.plugin.registry.getAllManagedCommands();
			const filtered = all
				.filter(
					(c) =>
						!q ||
						c.currentName.toLowerCase().includes(q) ||
						c.pluginName.toLowerCase().includes(q),
				)
				.slice(0, 140);

			filtered.forEach((cmd) => {
				const inGroup = cmd.group === this.groupName;
				const row = listEl.createDiv({
					cls: `cpm-assign-row ${inGroup ? "is-selected" : ""}`,
				});

				const info = row.createDiv({ cls: "cpm-assign-info" });
				info.createSpan({ cls: "cpm-plugin-tag", text: cmd.pluginName });
				info.createSpan({ text: cmd.currentName, cls: "cpm-assign-title" });

				const toggleBtn = row.createEl("button", {
					cls: `cpm-btn cpm-btn-xs ${inGroup ? "is-primary" : ""}`,
				});
				setIcon(toggleBtn.createSpan({ cls: "cpm-svg" }), inGroup ? "check" : "plus");
				toggleBtn.createSpan({ text: inGroup ? "Assigned" : "Add" });

				toggleBtn.addEventListener("click", voidAsync(async () => {
					const entry = this.plugin.registry.ensureOverrideEntry(cmd.id);
					entry.group = inGroup ? "" : this.groupName;
					await this.plugin.saveSettings();
					renderList();
					if (this.onDone) this.onDone();
				}));
			});
		};

		search.addEventListener(
			"input",
			debounce(() => {
				this.searchQuery = search.value;
				renderList();
			}, 100),
		);

		renderList();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Tiny helper so destructive flows share the same confirmation policy. */
export function confirmOrRun(
	app: App,
	enabled: boolean,
	title: string,
	message: string,
	confirmText: string,
	action: () => void | Promise<void>,
): void {
	if (!enabled) {
		void action();
		return;
	}
	new ConfirmModal(app, title, message, confirmText, action).open();
}

/** Re-exported so consumers keep a single import site for destructive prompts. */
export { Notice };
