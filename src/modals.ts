import { Modal, Notice, setIcon } from "obsidian";
import type { App, FuzzyMatch, FuzzySuggestModal } from "obsidian";
import { fuzzyScore, renderHighlightedText, debounce } from "./fuzzy";
import type CommandPaletteManagerPlugin from "./main";

/**
 * Modals ported from Nihon 1.2.0 (L346-1117).
 * TextPromptModal ({{prompt:}} expansion), ConfirmModal, InputModal,
 * VisualIconPickerModal, AssignCommandsToGroupModal.
 * QuickCommandPaletteModal + CommandManagerModal/UI live in ui.ts.
 */
export class TextPromptModal extends Modal {
  result = "";
  constructor(
    app: App,
    public promptLabel: string,
    public defaultValue = "",
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.promptLabel });
    const input = contentEl.createEl("input", { type: "text", value: this.defaultValue, cls: "cpm-text-input" });
    input.focus();
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.result = input.value;
        this.close();
      }
    });
    const btn = contentEl.createEl("button", { text: "OK", cls: "mod-cta" });
    btn.addEventListener("click", () => {
      this.result = input.value;
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class ConfirmModal extends Modal {
  confirmed = false;
  constructor(
    app: App,
    public title: string,
    public message: string,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.title });
    contentEl.createEl("p", { text: this.message });
    const row = contentEl.createDiv({ cls: "cpm-modal-actions" });
    row.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    row.createEl("button", { text: "Confirm", cls: "mod-cta" }).addEventListener("click", () => {
      this.confirmed = true;
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class InputModal extends Modal {
  result = "";
  constructor(
    app: App,
    public title: string,
    public placeholder = "",
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.title });
    const input = contentEl.createEl("input", { type: "text", placeholder: this.placeholder, cls: "cpm-text-input" });
    input.focus();
    contentEl.createEl("button", { text: "OK", cls: "mod-cta" }).addEventListener("click", () => {
      this.result = input.value;
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// Quick palette + manager UI shell — deep tabs are incremental, see README checklist.
export class QuickCommandPaletteModal extends Modal {
  searchQuery = "";
  constructor(app: App, public plugin: CommandPaletteManagerPlugin) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("cpm-quick-palette-modal");
    const input = contentEl.createEl("input", { type: "text", placeholder: "Type a command or alias…", cls: "cpm-search-input" });
    input.focus();
    const debounced = debounce(() => this.renderResults(contentEl, input.value), 80);
    input.addEventListener("input", () => debounced());
    this.renderResults(contentEl, "");
  }

  renderResults(container: HTMLElement, query: string): void {
    let list = container.querySelector(".cpm-results") as HTMLElement | null;
    if (!list) list = container.createDiv({ cls: "cpm-results" });
    list.empty();
    const commands = this.plugin.registry.getAllManagedCommands() as Array<{ id: string; name: string }>;
    const scored = commands
      .map((c) => ({ cmd: c, ...fuzzyScore(query, c.name) }))
      .filter((x) => x.match)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40);
    for (const { cmd } of scored) {
      const row = list!.createDiv({ cls: "cpm-result-row" });
      row.createEl("span", { text: cmd.name });
      row.addEventListener("click", () => {
        this.plugin.registry.executeCommandSafe(cmd.id);
        this.close();
      });
    }
    if (scored.length === 0) list!.createEl("div", { text: "No matches.", cls: "cpm-empty" });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class CommandManagerModal extends Modal {
  constructor(app: App, public plugin: CommandPaletteManagerPlugin) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("cpm-modal-window");
    contentEl.createEl("h2", { text: "Command Palette Manager" });
    contentEl.createEl("p", { text: "Deep tabs (commands/actions/macros/buttons) are the next split step — see README parity checklist.", cls: "cpm-muted" });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
