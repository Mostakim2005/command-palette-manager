"use strict";

const {
  Plugin,
  PluginSettingTab,
  Setting,
  Modal,
  Notice,
  Menu,
  Platform,
  normalizePath,
  MarkdownView,
  setIcon,
  setTooltip
} = require("obsidian");

const DEFAULT_ACTION_GROUPS = [
  "Pinned",
  "File & Save",
  "Editing & Formatting",
  "Links & Navigation",
  "Media & Assets",
  "View & Layout",
  "Search & Find",
  "Automation"
];

const DEFAULT_STARTER_BUTTONS = [
  {
    id: "starter-save",
    commandId: "editor:save-file",
    icon: "check",
    label: "Save current file",
    location: "header",
    color: "",
    device: "all",
    displayMode: "icon",
    tooltip: "Save current note"
  },
  {
    id: "starter-media",
    commandId: "note-toolbox:open-media-toolbox",
    icon: "layout-grid",
    label: "Open Media Toolbox",
    location: "header",
    color: "#00a884",
    device: "all",
    displayMode: "icon",
    tooltip: "Open Note Toolbox Media Picker"
  }
];

const MACRO_TEMPLATES = [
  {
    name: "Save & Toggle Reading View",
    desc: "Saves active file and switches between Editing and Reading view.",
    icon: "sparkles",
    aliases: ["saveread", "sr"],
    loop: 1,
    steps: [
      { type: "command", commandId: "editor:save-file", text: "", delayMs: 80 },
      { type: "command", commandId: "markdown:toggle-preview", text: "", delayMs: 0 }
    ]
  },
  {
    name: "Insert Timestamp Callout",
    desc: "Inserts a formatted callout with live date/time and saves.",
    icon: "pencil",
    aliases: ["callout", "notebox"],
    loop: 1,
    steps: [
      { type: "text", commandId: "", text: "> [!NOTE] Note taken on {{datetime}}\n> ", delayMs: 50 },
      { type: "command", commandId: "editor:save-file", text: "", delayMs: 0 }
    ]
  },
  {
    name: "Open Media Picker & Save",
    desc: "Opens Note Toolbox Media Picker and saves note.",
    icon: "image",
    aliases: ["pickmedia", "pm"],
    loop: 1,
    steps: [
      { commandId: "note-toolbox:open-media-toolbox", type: "command", text: "", delayMs: 200 },
      { commandId: "editor:save-file", type: "command", text: "", delayMs: 0 }
    ]
  },
  {
    name: "Format Note & Copy Clean Markdown",
    desc: "Saves file, copies active selection (or clipboard), and notifies.",
    icon: "clipboard",
    aliases: ["copyclean", "cc"],
    loop: 1,
    steps: [
      { type: "command", commandId: "editor:save-file", text: "", delayMs: 60 },
      { type: "notice", commandId: "", text: "Note saved & processed cleanly!", delayMs: 0 }
    ]
  }
];

const VISUAL_ICONS = [
  // Editing & Text
  { id: "sparkles", label: "Sparkles", cat: "Editing" },
  { id: "zap", label: "Bolt", cat: "Editing" },
  { id: "terminal", label: "Terminal", cat: "Editing" },
  { id: "command", label: "Command", cat: "Editing" },
  { id: "pencil", label: "Edit", cat: "Editing" },
  { id: "bold", label: "Bold", cat: "Editing" },
  { id: "italic", label: "Italic", cat: "Editing" },
  { id: "code", label: "Code", cat: "Editing" },
  { id: "quote", label: "Quote", cat: "Editing" },
  { id: "list", label: "List", cat: "Editing" },
  { id: "list-checks", label: "Checklist", cat: "Editing" },
  { id: "table", label: "Table", cat: "Editing" },
  { id: "heading", label: "Heading", cat: "Editing" },
  { id: "wand", label: "Wand", cat: "Editing" },
  { id: "check", label: "Check", cat: "Editing" },
  { id: "plus", label: "Plus", cat: "Editing" },
  { id: "minus", label: "Minus", cat: "Editing" },
  // Files & Organization
  { id: "folder", label: "Folder", cat: "Files" },
  { id: "folder-plus", label: "Folder Plus", cat: "Files" },
  { id: "file-text", label: "Note", cat: "Files" },
  { id: "file-plus", label: "New File", cat: "Files" },
  { id: "save", label: "Save", cat: "Files" },
  { id: "copy", label: "Copy", cat: "Files" },
  { id: "clipboard", label: "Clipboard", cat: "Files" },
  { id: "archive", label: "Archive", cat: "Files" },
  { id: "download", label: "Download", cat: "Files" },
  { id: "upload", label: "Upload", cat: "Files" },
  { id: "trash-2", label: "Trash", cat: "Files" },
  { id: "paperclip", label: "Attach", cat: "Files" },
  // Navigation & View
  { id: "search", label: "Search", cat: "Navigation" },
  { id: "eye", label: "Eye", cat: "Navigation" },
  { id: "eye-off", label: "Hidden", cat: "Navigation" },
  { id: "link", label: "Link", cat: "Navigation" },
  { id: "external-link", label: "External", cat: "Navigation" },
  { id: "split", label: "Split", cat: "Navigation" },
  { id: "layers", label: "Layers", cat: "Navigation" },
  { id: "layout-grid", label: "Grid", cat: "Navigation" },
  { id: "bookmark", label: "Bookmark", cat: "Navigation" },
  { id: "tag", label: "Tag", cat: "Navigation" },
  { id: "pin", label: "Pin", cat: "Navigation" },
  { id: "star", label: "Star", cat: "Navigation" },
  { id: "rotate-ccw", label: "Revert", cat: "Navigation" },
  { id: "refresh-cw", label: "Sync", cat: "Navigation" },
  { id: "home", label: "Home", cat: "Navigation" },
  // Media & Assets
  { id: "image", label: "Image", cat: "Media" },
  { id: "music", label: "Audio", cat: "Media" },
  { id: "video", label: "Video", cat: "Media" },
  { id: "camera", label: "Camera", cat: "Media" },
  { id: "mic", label: "Mic", cat: "Media" },
  { id: "volume-2", label: "Volume", cat: "Media" },
  // Tools & System
  { id: "settings", label: "Settings", cat: "Tools" },
  { id: "sliders", label: "Sliders", cat: "Tools" },
  { id: "tool", label: "Tool", cat: "Tools" },
  { id: "wrench", label: "Wrench", cat: "Tools" },
  { id: "key", label: "Key", cat: "Tools" },
  { id: "lock", label: "Lock", cat: "Tools" },
  { id: "shield", label: "Shield", cat: "Tools" },
  { id: "cpu", label: "CPU", cat: "Tools" },
  { id: "database", label: "Database", cat: "Tools" },
  { id: "globe", label: "Globe", cat: "Tools" },
  { id: "sun", label: "Sun", cat: "Tools" },
  { id: "moon", label: "Moon", cat: "Tools" },
  { id: "clock", label: "Clock", cat: "Tools" },
  { id: "calendar", label: "Calendar", cat: "Tools" },
  { id: "bell", label: "Bell", cat: "Tools" },
  { id: "play", label: "Play", cat: "Tools" },
  { id: "pause", label: "Pause", cat: "Tools" }
];

const CORE_PREFIX_LABELS = {
  editor: "Core: Editor",
  workspace: "Core: Workspace",
  "file-explorer": "Core: Files",
  markdown: "Core: Markdown",
  canvas: "Core: Canvas",
  "command-palette": "Core: Palette",
  "daily-notes": "Core: Daily Notes",
  switcher: "Core: Switcher",
  graph: "Core: Graph",
  backlink: "Core: Backlinks",
  "outgoing-links": "Core: Outgoing",
  "tag-pane": "Core: Tags",
  "page-preview": "Core: Preview",
  templates: "Core: Templates",
  "note-composer": "Core: Composer",
  "word-count": "Core: Word Count",
  "open-with-default-app": "Core: System",
  theme: "Core: Theme",
  app: "Core: App"
};

const DEFAULT_SETTINGS = {
  commandOverrides: {},
  actionGroups: [...DEFAULT_ACTION_GROUPS],
  pinnedButtons: [...DEFAULT_STARTER_BUTTONS],
  macros: [],
  recentCommandIds: [],
  cardStyle: "single", // "single" | "double" | "grid"
  bulkBarMode: "contextual", // "contextual" | "always"
  aliasPrefixMode: "source", // "source" | "none" | "custom" | "manager"
  customAliasPrefix: "⚡",
  appendAliasesToOriginal: false,
  enableQuickPalette: true,
  quickPaletteSort: "frequency", // "frequency" | "recent" | "alpha" | "pinned"
  showHotkeys: true,
  showPluginBadges: true,
  confirmDestructive: true,
  autoBackupOnSave: true,
  autoGroupInitialized: false,
  accentThemeMode: "theme", // "theme" | "custom"
  customAccentColor: "#00a884",
  glassmorphism: true,
  commandStats: {} // { [cmdId]: { runs: number, lastRun: number } }
};

function debounce(fn, waitMs = 120) {
  let timer = null;
  return function (...args) {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn.apply(this, args), waitMs);
  };
}

/**
 * Intelligent Raycast-style Fuzzy Match Scoring
 */
function fuzzyScore(query, target) {
  if (!query) return { match: true, score: 0, indices: [] };
  const q = query.trim().toLowerCase();
  const t = target.toLowerCase();

  // 1. Exact match
  if (t === q) {
    return {
      match: true,
      score: 1000,
      indices: Array.from({ length: q.length }, (_, i) => i)
    };
  }

  // 2. Exact prefix match
  if (t.startsWith(q)) {
    return {
      match: true,
      score: 800 + 100 / Math.max(1, t.length),
      indices: Array.from({ length: q.length }, (_, i) => i)
    };
  }

  // 3. Word boundary match
  const wordIdx = t.indexOf(q);
  if (wordIdx !== -1) {
    const isBoundary = wordIdx === 0 || /[^a-zA-Z0-9]/.test(t[wordIdx - 1]);
    const score = isBoundary ? 600 + 100 / (wordIdx + 1) : 400;
    const indices = [];
    for (let i = 0; i < q.length; i++) indices.push(wordIdx + i);
    return { match: true, score, indices };
  }

  // 4. Acronym match (initials of words)
  const words = t.split(/[\s:\-_/]+/);
  if (words.length > 1) {
    const acronym = words.map((w) => w[0] || "").join("");
    if (acronym.startsWith(q)) {
      return { match: true, score: 500, indices: [] };
    }
  }

  // 5. Fuzzy character subsequence
  let qIdx = 0;
  let score = 0;
  let prevMatchIdx = -2;
  const indices = [];

  for (let i = 0; i < t.length && qIdx < q.length; i++) {
    if (t[i] === q[qIdx]) {
      indices.push(i);
      if (i === prevMatchIdx + 1) score += 30; // consecutive match bonus
      if (i === 0 || /[^a-zA-Z0-9]/.test(t[i - 1])) score += 40; // word start bonus
      else score += 10;
      prevMatchIdx = i;
      qIdx++;
    }
  }

  if (qIdx === q.length) {
    score -= (t.length - q.length) * 0.5;
    return { match: true, score, indices };
  }

  return { match: false, score: -1, indices: [] };
}

/**
 * Safely renders text with highlighted matching characters
 */
function renderHighlightedText(container, text, indices) {
  if (!indices || indices.length === 0) {
    container.createSpan({ text });
    return;
  }
  const indexSet = new Set(indices);
  let currentSpan = null;
  let isCurrentHighlight = null;

  for (let i = 0; i < text.length; i++) {
    const isH = indexSet.has(i);
    if (currentSpan === null || isCurrentHighlight !== isH) {
      isCurrentHighlight = isH;
      currentSpan = container.createSpan({
        cls: isH ? "cpm-match-highlight" : ""
      });
    }
    currentSpan.textContent += text[i];
  }
}

/**
 * Security: Validates and sanitizes external URIs to prevent arbitrary protocol execution
 */
function validateSafeUri(rawUri) {
  if (!rawUri || typeof rawUri !== "string") return null;
  const trimmed = rawUri.trim();
  const allowedProtocols = ["https:", "http:", "obsidian:", "mailto:"];
  try {
    const parsed = new URL(trimmed);
    if (allowedProtocols.includes(parsed.protocol)) {
      return parsed.href;
    }
  } catch {
    if (/^obsidian:\/\/[^\s]+$/i.test(trimmed)) {
      return trimmed;
    }
  }
  return null;
}

/**
 * Interactive text prompt modal for dynamic macro expansion {{prompt:Prompt Text}}
 */
class TextPromptModal extends Modal {
  constructor(app, promptLabel, defaultValue = "") {
    super(app);
    this.promptLabel = promptLabel;
    this.defaultValue = defaultValue;
    this.submitted = false;
    this.result = null;
    this.promise = new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  onOpen() {
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
      cls: "cpm-input cpm-w-full"
    });
    input.placeholder = "Type your response here...";

    const footer = contentEl.createDiv({ cls: "cpm-dialog-footer" });
    const cancelBtn = footer.createEl("button", { cls: "cpm-btn", text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const okBtn = footer.createEl("button", { cls: "cpm-btn is-primary", text: "Continue" });
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

  onClose() {
    if (!this.submitted) {
      this.resolvePromise(null);
    } else {
      this.resolvePromise(this.result);
    }
  }

  waitForResponse() {
    return this.promise;
  }
}

/**
 * Expands dynamic variables in macro text snippets with lateral power features
 */
async function expandMacroVariables(text, app) {
  if (!text) return "";
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const datetimeStr = `${dateStr} ${timeStr}`;

  let activeTitle = "";
  let activePath = "";
  let activeFolder = "";
  let activeSelection = "";
  const activeView = app.workspace.getActiveViewOfType(MarkdownView);
  if (activeView) {
    if (activeView.file) {
      activeTitle = activeView.file.basename;
      activePath = activeView.file.path;
      activeFolder = activeView.file.parent?.name || "";
    }
    if (activeView.editor) activeSelection = activeView.editor.getSelection() || "";
  }

  let clipboardText = "";
  if (text.includes("{{clipboard}}")) {
    try {
      if (navigator.clipboard?.readText) {
        clipboardText = await navigator.clipboard.readText();
      }
    } catch {
      clipboardText = "";
    }
  }

  let processed = text
    .replace(/\{\{date\}\}/gi, dateStr)
    .replace(/\{\{time\}\}/gi, timeStr)
    .replace(/\{\{datetime\}\}/gi, datetimeStr)
    .replace(/\{\{year\}\}/gi, String(now.getFullYear()))
    .replace(/\{\{month\}\}/gi, pad(now.getMonth() + 1))
    .replace(/\{\{day\}\}/gi, pad(now.getDate()))
    .replace(/\{\{title\}\}/gi, activeTitle)
    .replace(/\{\{path\}\}/gi, activePath)
    .replace(/\{\{folder\}\}/gi, activeFolder)
    .replace(/\{\{selection\}\}/gi, activeSelection)
    .replace(/\{\{clipboard\}\}/gi, clipboardText)
    .replace(/\{\{uuid\}\}/gi, Date.now().toString(36) + Math.random().toString(36).slice(2, 6));

  // Interactive {{prompt:Prompt Label}}
  const promptPattern = /\{\{prompt:([^}]+)\}\}/gi;
  let match;
  while ((match = promptPattern.exec(processed)) !== null) {
    const fullMatch = match[0];
    const promptLabel = match[1];
    const modal = new TextPromptModal(app, promptLabel);
    modal.open();
    const userInput = await modal.waitForResponse();
    if (userInput === null) {
      throw new Error("Macro aborted by user");
    }
    processed = processed.replace(fullMatch, userInput);
  }
  return processed;
}

class ConfirmModal extends Modal {
  constructor(app, title, message, confirmText = "Confirm", onConfirm) {
    super(app);
    this.titleText = title;
    this.message = message;
    this.confirmText = confirmText;
    this.onConfirm = onConfirm;
  }

  onOpen() {
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
      cls: "cpm-btn is-danger"
    });
    confirmBtn.addEventListener("click", async () => {
      this.close();
      await this.onConfirm();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class InputModal extends Modal {
  constructor(app, title, placeholder, initialValue, onSubmit) {
    super(app);
    this.titleText = title;
    this.placeholder = placeholder;
    this.initialValue = initialValue || "";
    this.onSubmit = onSubmit;
  }

  onOpen() {
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
      cls: "cpm-input cpm-w-full"
    });

    const actions = contentEl.createDiv({ cls: "cpm-dialog-actions" });
    actions.createEl("button", { text: "Cancel", cls: "cpm-btn" }).addEventListener("click", () => this.close());
    const saveBtn = actions.createEl("button", { text: "Save", cls: "cpm-btn is-primary" });

    const submit = () => {
      const val = input.value.trim();
      if (val) {
        this.close();
        this.onSubmit(val);
      }
    };
    saveBtn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => e.key === "Enter" && submit());
    window.setTimeout(() => input.focus(), 40);
  }

  onClose() {
    this.contentEl.empty();
  }
}

class VisualIconPickerModal extends Modal {
  constructor(app, currentIcon, onSelect) {
    super(app);
    this.currentIcon = currentIcon;
    this.onSelect = onSelect;
    this.searchQuery = "";
    this.selectedCat = "All";
  }

  onOpen() {
    this.modalEl.addClass("cpm-icon-picker-modal");
    const { contentEl } = this;
    contentEl.empty();

    const top = contentEl.createDiv({ cls: "cpm-modal-head" });
    top.createEl("h3", { text: "Choose Lucide Visual Icon" });
    const closeBtn = top.createEl("button", { cls: "cpm-icon-btn" });
    setIcon(closeBtn, "x");
    closeBtn.addEventListener("click", () => this.close());

    // Search and Custom Icon Input Bar
    const searchRow = contentEl.createDiv({ cls: "cpm-toolbar-row" });
    const search = searchRow.createEl("input", {
      type: "search",
      placeholder: "Filter built-in icons...",
      cls: "cpm-input cpm-flex-1"
    });

    const customInput = searchRow.createEl("input", {
      type: "text",
      placeholder: "Custom Lucide icon ID...",
      cls: "cpm-input cpm-flex-1"
    });

    const customPreview = searchRow.createDiv({ cls: "cpm-icon-custom-preview" });
    setIcon(customPreview, this.currentIcon || "terminal");

    const applyCustomBtn = searchRow.createEl("button", {
      cls: "cpm-btn is-tonal cpm-btn-xs",
      text: "Apply"
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

    // Categories
    const categories = ["All", "Editing", "Files", "Navigation", "Media", "Tools"];
    const catBar = contentEl.createDiv({ cls: "cpm-chip-strip" });
    categories.forEach((cat) => {
      const chip = catBar.createEl("button", {
        cls: `cpm-chip ${this.selectedCat === cat ? "is-active" : ""}`,
        text: cat
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
          cls: `cpm-icon-tile ${this.currentIcon === ic.id ? "is-active" : ""}`
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

  onClose() {
    this.contentEl.empty();
  }
}

class AssignCommandsToGroupModal extends Modal {
  constructor(app, plugin, groupName, onDone) {
    super(app);
    this.plugin = plugin;
    this.groupName = groupName;
    this.onDone = onDone;
    this.searchQuery = "";
  }

  onOpen() {
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
      cls: "cpm-input cpm-w-full"
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
            c.pluginName.toLowerCase().includes(q)
        )
        .slice(0, 140);

      filtered.forEach((cmd) => {
        const inGroup = cmd.group === this.groupName;
        const row = listEl.createDiv({
          cls: `cpm-assign-row ${inGroup ? "is-selected" : ""}`
        });

        const info = row.createDiv({ cls: "cpm-assign-info" });
        info.createSpan({ cls: "cpm-plugin-tag", text: cmd.pluginName });
        info.createSpan({ text: cmd.currentName, cls: "cpm-assign-title" });

        const toggleBtn = row.createEl("button", {
          cls: `cpm-btn cpm-btn-xs ${inGroup ? "is-primary" : ""}`
        });
        setIcon(toggleBtn.createSpan({ cls: "cpm-svg" }), inGroup ? "check" : "plus");
        toggleBtn.createSpan({ text: inGroup ? "Assigned" : "Add" });

        toggleBtn.addEventListener("click", async () => {
          const entry = this.plugin.registry.ensureOverrideEntry(cmd.id);
          entry.group = inGroup ? "" : this.groupName;
          await this.plugin.saveSettings();
          renderList();
          if (this.onDone) this.onDone();
        });
      });
    };

    search.addEventListener("input", debounce(() => {
      this.searchQuery = search.value;
      renderList();
    }, 100));

    renderList();
  }

  onClose() {
    this.contentEl.empty();
  }
}

class QuickCommandPaletteModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.registry = plugin.registry;
    this.searchQuery = "";
    this.selectedGroup = "all";
    this.selectedIndex = 0;
    this.renderedItems = [];
  }

  onOpen() {
    this.modalEl.addClass("cpm-quick-palette-modal");
    const { contentEl } = this;
    contentEl.empty();

    const searchRow = contentEl.createDiv({ cls: "cpm-qp-search-bar" });
    const searchIcon = searchRow.createSpan({ cls: "cpm-qp-search-icon" });
    setIcon(searchIcon, "search");

    this.searchInput = searchRow.createEl("input", {
      type: "text",
      placeholder: "Type command, alias, @group, #plugin, or !macro...",
      cls: "cpm-qp-input"
    });

    const clearBtn = searchRow.createEl("button", { cls: "cpm-icon-btn cpm-qp-clear-btn" });
    setIcon(clearBtn, "x");
    clearBtn.style.display = "none";
    clearBtn.addEventListener("click", () => {
      this.searchInput.value = "";
      this.searchQuery = "";
      clearBtn.style.display = "none";
      this.renderResults();
      this.searchInput.focus();
    });

    const sortSelect = searchRow.createEl("select", { cls: "cpm-select cpm-select-xs" });
    [
      { id: "frequency", label: "Sort: Most Used" },
      { id: "recent", label: "Sort: Recent" },
      { id: "pinned", label: "Sort: Starred First" },
      { id: "alpha", label: "Sort: A-Z" }
    ].forEach((s) => {
      const opt = sortSelect.createEl("option", { text: s.label, value: s.id });
      opt.selected = (this.plugin.settings.quickPaletteSort || "frequency") === s.id;
    });
    sortSelect.addEventListener("change", async () => {
      this.plugin.settings.quickPaletteSort = sortSelect.value;
      await this.plugin.saveSettings();
      this.renderResults();
    });

    const mgrBtn = searchRow.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
    setIcon(mgrBtn.createSpan({ cls: "cpm-svg" }), "settings");
    mgrBtn.createSpan({ text: "Manage" });
    setTooltip(mgrBtn, "Open full Command Palette Manager (Alt+M)");
    mgrBtn.addEventListener("click", () => {
      this.close();
      new CommandManagerModal(this.app, this.plugin).open();
    });

    const chipRow = contentEl.createDiv({ cls: "cpm-chip-strip" });
    const groups = ["all", "Pinned", ...(this.plugin.settings.actionGroups || []).filter((g) => g !== "Pinned")];
    groups.forEach((g) => {
      const chip = chipRow.createEl("button", {
        cls: `cpm-chip ${this.selectedGroup === g ? "is-active" : ""}`,
        text: g === "all" ? "All" : g
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
    const addFooterHint = (keyText, labelText) => {
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
      clearBtn.style.display = this.searchQuery ? "inline-flex" : "none";
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
            (this.selectedIndex - 1 + this.renderedItems.length) % this.renderedItems.length;
          this.updateHighlight();
        }
      } else if (e.key === "PageDown") {
        e.preventDefault();
        if (this.renderedItems.length > 0) {
          this.selectedIndex = Math.min(this.renderedItems.length - 1, this.selectedIndex + 8);
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
          this.registry.executeCommandSafe(chosen.id);
        }
      } else if (e.altKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        this.close();
        new CommandManagerModal(this.app, this.plugin).open();
      }
    });

    this.renderResults();
    window.setTimeout(() => this.searchInput.focus(), 30);
  }

  renderResults() {
    this.resultsEl.empty();
    let rawQuery = this.searchQuery.trim();
    let filterOperator = "";
    let operatorParam = "";
    let cleanQuery = rawQuery;

    // Parse Raycast-style Prefix Operators (@group, #plugin, !, *)
    if (rawQuery.startsWith("@")) {
      filterOperator = "@";
      const parts = rawQuery.slice(1).split(" ");
      operatorParam = parts[0].toLowerCase();
      cleanQuery = parts.slice(1).join(" ").trim();
    } else if (rawQuery.startsWith("#")) {
      filterOperator = "#";
      const parts = rawQuery.slice(1).split(" ");
      operatorParam = parts[0].toLowerCase();
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
    const all = this.registry.getAllManagedCommands().filter((c) => !c.hidden);

    const scoredItems = [];

    all.forEach((c) => {
      // 1. Group Chip Filter
      if (this.selectedGroup === "Pinned" && !c.pinned && c.group !== "Pinned") return;
      if (this.selectedGroup !== "all" && this.selectedGroup !== "Pinned" && c.group !== this.selectedGroup) {
        return;
      }

      // 2. Prefix Operators Filter
      if (filterOperator === "@" && operatorParam) {
        if (!c.group.toLowerCase().includes(operatorParam)) return;
      } else if (filterOperator === "#" && operatorParam) {
        if (!c.pluginName.toLowerCase().includes(operatorParam) && !c.pluginId.toLowerCase().includes(operatorParam)) return;
      } else if (filterOperator === "!") {
        if (!c.id.startsWith("macro:") && !c.id.includes(":macro-")) return;
      } else if (filterOperator === "*") {
        if (!c.pinned) return;
      }

      // 3. Fuzzy Scored Search
      if (!cleanQuery) {
        scoredItems.push({ cmd: c, score: 0, matchIndices: [] });
        return;
      }

      const nameScore = fuzzyScore(cleanQuery, c.currentName);
      let bestScore = nameScore.match ? nameScore.score : -1;
      let matchIndices = nameScore.match ? nameScore.indices : [];

      // Check aliases
      for (const al of c.aliases) {
        const alScore = fuzzyScore(cleanQuery, al);
        if (alScore.match && alScore.score + 100 > bestScore) {
          bestScore = alScore.score + 100; // bonus for alias match
        }
      }

      // Check plugin name if not matched yet
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

    // Smart Sorting
    scoredItems.sort((a, b) => {
      // Pinned boost
      if (a.cmd.pinned !== b.cmd.pinned) return a.cmd.pinned ? -1 : 1;

      // When query is active, sort by fuzzy score first
      if (cleanQuery) {
        if (Math.abs(a.score - b.score) > 10) {
          return b.score - a.score;
        }
      }

      // User-selected secondary sort
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
        text: "No matching commands found. Try typing another keyword, @group, #plugin, or !macro."
      });
      return;
    }

    scoredItems.slice(0, 90).forEach(({ cmd, matchIndices }, idx) => {
      const row = this.resultsEl.createDiv({
        cls: `cpm-qp-row ${idx === this.selectedIndex ? "is-active" : ""}`
      });

      const starBtn = row.createEl("button", {
        cls: `cpm-icon-btn ${cmd.pinned ? "is-starred" : ""}`
      });
      setIcon(starBtn, "star");
      setTooltip(starBtn, cmd.pinned ? "Unstar command" : "Star to pin at top");
      starBtn.addEventListener("click", async (evt) => {
        evt.stopPropagation();
        const entry = this.registry.ensureOverrideEntry(cmd.id);
        entry.pinned = !cmd.pinned;
        await this.plugin.saveSettings();
        this.renderResults();
        this.searchInput.focus();
      });

      const left = row.createDiv({ cls: "cpm-qp-main" });
      const cmdIcon = left.createSpan({ cls: "cpm-qp-cmd-icon" });
      setIcon(cmdIcon, cmd.icon || "terminal");

      left.createSpan({ cls: "cpm-plugin-tag", text: cmd.pluginName });

      const titleSpan = left.createSpan({ cls: "cpm-qp-title" });
      renderHighlightedText(titleSpan, cmd.currentName, matchIndices);

      const usage = stats[cmd.id];
      if (usage?.runs && usage.runs > 0) {
        left.createSpan({
          cls: "cpm-usage-tag",
          text: `${usage.runs}x`
        });
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
        this.registry.executeCommandSafe(cmd.id);
      });
    });
  }

  updateHighlight() {
    const rows = this.resultsEl.querySelectorAll(".cpm-qp-row");
    rows.forEach((r, idx) => {
      r.toggleClass("is-active", idx === this.selectedIndex);
      if (idx === this.selectedIndex) {
        r.scrollIntoView({ block: "nearest" });
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class CommandRegistryService {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.originalSnapshot = new Map();
    this.hiddenBackup = new Map();
    this.registeredProxyIds = new Set();
    this.registeredMacroIds = new Set();
    this.interceptorsInstalled = false;
    this.debouncedSaveUsageStats = debounce(() => {
      void this.plugin.saveData(this.settings);
    }, 1200);
  }

  get settings() {
    return this.plugin.settings;
  }

  resolvePluginInfo(cmdId, rawName = "") {
    if (!cmdId || !cmdId.includes(":")) {
      return { pluginId: "core", pluginName: "Obsidian Core", rawPrefix: "" };
    }
    const prefix = cmdId.split(":")[0];
    const manifest = this.app.plugins?.manifests?.[prefix];
    if (manifest) {
      return {
        pluginId: prefix,
        pluginName: manifest.name,
        rawPrefix: manifest.name
      };
    }
    if (CORE_PREFIX_LABELS[prefix]) {
      return {
        pluginId: `core-${prefix}`,
        pluginName: CORE_PREFIX_LABELS[prefix],
        rawPrefix: rawName.includes(":") ? rawName.split(":")[0].trim() : ""
      };
    }
    const internal = this.app.internalPlugins?.plugins?.[prefix];
    if (internal) {
      return {
        pluginId: `core-${prefix}`,
        pluginName: `Core: ${prefix}`,
        rawPrefix: ""
      };
    }
    return { pluginId: prefix, pluginName: prefix, rawPrefix: prefix };
  }

  formatAliasDisplayName(targetId, aliasText) {
    const mode = this.settings.aliasPrefixMode || "source";
    if (mode === "none") {
      return aliasText;
    }
    if (mode === "source") {
      const snap = this.originalSnapshot.get(targetId);
      if (snap && snap.rawPrefix) {
        return `${snap.rawPrefix}: ${aliasText}`;
      }
      if (snap && snap.pluginName && !snap.pluginName.startsWith("Core:")) {
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

  registerRawCommandObject(cmdObj) {
    if (!this.app.commands) return;
    if (typeof this.app.commands.addCommand === "function") {
      this.app.commands.addCommand(cmdObj);
    } else if (this.app.commands.commands) {
      this.app.commands.commands[cmdObj.id] = cmdObj;
    }
  }

  /**
   * Registers a context-aware alias proxy command that forwards checkCallback and editorCallback
   */
  registerAliasProxyCommand(fullProxyId, displayName, icon, targetId) {
    const getTarget = () =>
      this.app.commands?.commands?.[targetId] || this.hiddenBackup.get(targetId);

    const proxyCmd = {
      id: fullProxyId,
      name: displayName,
      icon: icon || "terminal",
      checkCallback: (checking) => {
        const target = getTarget();
        if (!target) return false;

        // Forward checkCallback
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

        // Forward editorCheckCallback
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

        // Forward editorCallback
        if (typeof target.editorCallback === "function") {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (!view || !view.editor) return false;
          if (checking) return true;
          return this.executeCommandSafe(targetId);
        }

        // Plain callback
        if (checking) return true;
        return this.executeCommandSafe(targetId);
      }
    };

    this.registerRawCommandObject(proxyCmd);
  }

  installCommandInterceptors() {
    if (this.interceptorsInstalled || !this.app.commands) return;

    this.origExecuteCommandById = this.app.commands.executeCommandById?.bind(this.app.commands);
    this.origListCommands = typeof this.app.commands.listCommands === "function"
      ? this.app.commands.listCommands.bind(this.app.commands)
      : null;
    this.origFindCommand = typeof this.app.commands.findCommand === "function"
      ? this.app.commands.findCommand.bind(this.app.commands)
      : null;

    // 1. Intercept executeCommandById so hidden commands and shortcuts ALWAYS execute safely
    if (this.origExecuteCommandById) {
      this.app.commands.executeCommandById = (id) => {
        if (this.hiddenBackup.has(id)) {
          const hiddenCmd = this.hiddenBackup.get(id);
          this.app.commands.commands[id] = hiddenCmd;
          try {
            this.recordCommandUsage(id);
            return this.origExecuteCommandById(id);
          } finally {
            delete this.app.commands.commands[id];
          }
        }
        this.recordCommandUsage(id);
        return this.origExecuteCommandById(id);
      };
    }

    // 2. Intercept findCommand so other plugins & hotkeys find hidden commands
    if (this.origFindCommand) {
      this.app.commands.findCommand = (id) => {
        const cmd = this.origFindCommand(id);
        if (cmd) return cmd;
        return this.hiddenBackup.get(id) || null;
      };
    }

    // 3. Intercept listCommands to filter hidden commands from palettes
    if (this.origListCommands) {
      this.app.commands.listCommands = () => {
        const list = this.origListCommands();
        return list.filter((cmd) => !this.hiddenBackup.has(cmd.id));
      };
    }

    this.interceptorsInstalled = true;
  }

  uninstallCommandInterceptors() {
    if (!this.interceptorsInstalled || !this.app.commands) return;
    if (this.origExecuteCommandById) this.app.commands.executeCommandById = this.origExecuteCommandById;
    if (this.origListCommands) this.app.commands.listCommands = this.origListCommands;
    if (this.origFindCommand) this.app.commands.findCommand = this.origFindCommand;
    this.interceptorsInstalled = false;
  }

  getHotkeyForCommand(cmdId) {
    if (!this.settings.showHotkeys) return "";
    try {
      const hkManager = this.app.hotkeyManager;
      if (!hkManager) return "";
      const keys = hkManager.getHotkeys(cmdId) || hkManager.getDefaultHotkeys(cmdId);
      if (!Array.isArray(keys) || keys.length === 0) return "";
      const first = keys[0];
      const mods = (first.modifiers || []).join("+");
      return mods ? `${mods}+${first.key.toUpperCase()}` : first.key.toUpperCase();
    } catch {
      return "";
    }
  }

  openHotkeySettingsFor(queryText) {
    try {
      this.app.setting.open();
      this.app.setting.openTabById("hotkeys");
      const tab = this.app.setting.activeTab;
      if (tab?.searchComponent?.inputEl) {
        tab.searchComponent.inputEl.value = queryText;
        tab.searchComponent.inputEl.dispatchEvent(new Event("input"));
      }
    } catch {
      new Notice("Open Settings -> Hotkeys to bind shortcut.");
    }
  }

  inferSmartGroup(cmdId, cmdName) {
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

  autoGroupCommands(overwriteExisting = false) {
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

  scanAndSyncAll() {
    this.installCommandInterceptors();
    const liveCommands = this.app.commands?.commands || {};

    for (const [id, cmd] of Object.entries(liveCommands)) {
      if (
        id.startsWith("cpm-alias:") ||
        id.startsWith(`${this.plugin.manifest.id}:alias-`) ||
        id.startsWith(`${this.plugin.manifest.id}:macro-`)
      ) {
        continue;
      }
      if (!this.originalSnapshot.has(id)) {
        const info = this.resolvePluginInfo(id, cmd.name || "");
        this.originalSnapshot.set(id, {
          id,
          originalName: cmd.name || id,
          originalIcon: cmd.icon || "terminal",
          pluginId: info.pluginId,
          pluginName: info.pluginName,
          rawPrefix: info.rawPrefix
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

  getAllManagedCommands() {
    const list = [];
    const stats = this.settings.commandStats || {};

    for (const [id, snap] of this.originalSnapshot.entries()) {
      const override = this.settings.commandOverrides[id] || {};
      const liveCmd = this.app.commands?.commands?.[id] || this.hiddenBackup.get(id);
      const hasCustomName = Boolean(
        override.customName && override.customName !== snap.originalName
      );
      const hasAliases = Boolean(override.aliases && override.aliases.length > 0);
      const isHidden = Boolean(override.hidden);
      const isPinned = Boolean(override.pinned);
      const usage = stats[id];

      list.push({
        id,
        originalName: snap.originalName,
        currentName: hasCustomName ? override.customName : snap.originalName,
        customName: override.customName || "",
        icon: liveCmd?.icon || snap.originalIcon || "terminal",
        pluginId: snap.pluginId,
        pluginName: snap.pluginName,
        aliases: Array.isArray(override.aliases) ? override.aliases : [],
        hidden: isHidden,
        pinned: isPinned,
        group: override.group || "",
        hotkey: this.getHotkeyForCommand(id),
        runs: usage?.runs || 0,
        lastRun: usage?.lastRun || 0,
        isModified: hasCustomName || hasAliases || isHidden || isPinned
      });
    }
    return list;
  }

  ensureOverrideEntry(id) {
    if (!this.settings.commandOverrides[id]) {
      this.settings.commandOverrides[id] = {
        customName: "",
        aliases: [],
        hidden: false,
        pinned: false,
        group: ""
      };
    }
    return this.settings.commandOverrides[id];
  }

  syncOverrides() {
    const liveCommands = this.app.commands?.commands || {};

    for (const [id, snap] of this.originalSnapshot.entries()) {
      const override = this.settings.commandOverrides[id];

      if ((!override || !override.hidden) && this.hiddenBackup.has(id)) {
        liveCommands[id] = this.hiddenBackup.get(id);
        this.hiddenBackup.delete(id);
      }

      const targetCmd = liveCommands[id] || this.hiddenBackup.get(id);
      if (!targetCmd) continue;

      let baseName =
        override?.customName?.trim()
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
        if (liveCommands[id]) {
          this.hiddenBackup.set(id, liveCommands[id]);
          delete liveCommands[id];
        }
      }
    }
  }

  syncAliases() {
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
          targetId
        );
        this.registeredProxyIds.add(fullProxyId);
      });
    }
  }

  syncMacros() {
    for (const macroCmdId of this.registeredMacroIds) {
      this.removeCommandById(macroCmdId);
    }
    this.registeredMacroIds.clear();

    (this.settings.macros || []).forEach((macro) => {
      if (!macro.id || !macro.name) return;
      const fullId = `${this.plugin.manifest.id}:macro-${macro.id}`;
      const macroDisplay =
        this.settings.aliasPrefixMode === "none"
          ? macro.name
          : `Macro: ${macro.name}`;

      this.registerRawCommandObject({
        id: fullId,
        name: macroDisplay,
        icon: macro.icon || "sparkles",
        callback: () => void this.plugin.macroEngine.runMacro(macro.id)
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
          callback: () => void this.plugin.macroEngine.runMacro(macro.id)
        });
        this.registeredMacroIds.add(aliasFullId);
      });
    });
  }

  recordCommandUsage(cmdId) {
    if (!cmdId) return;
    if (!this.settings.commandStats) this.settings.commandStats = {};
    if (!this.settings.commandStats[cmdId]) {
      this.settings.commandStats[cmdId] = { runs: 0, lastRun: 0 };
    }
    this.settings.commandStats[cmdId].runs += 1;
    this.settings.commandStats[cmdId].lastRun = Date.now();

    if (!Array.isArray(this.settings.recentCommandIds)) {
      this.settings.recentCommandIds = [];
    }
    this.settings.recentCommandIds = [
      cmdId,
      ...this.settings.recentCommandIds.filter((id) => id !== cmdId)
    ].slice(0, 30);

    this.debouncedSaveUsageStats();
  }

  executeCommandSafe(cmdId) {
    if (cmdId.startsWith("macro:")) {
      const macroId = cmdId.slice("macro:".length);
      void this.plugin.macroEngine.runMacro(macroId);
      return true;
    }

    const liveCommands = this.app.commands?.commands || {};
    if (liveCommands[cmdId]) {
      this.recordCommandUsage(cmdId);
      return this.app.commands.executeCommandById(cmdId);
    }

    const hiddenCmd = this.hiddenBackup.get(cmdId);
    if (hiddenCmd) {
      liveCommands[cmdId] = hiddenCmd;
      try {
        this.recordCommandUsage(cmdId);
        return this.app.commands.executeCommandById(cmdId);
      } finally {
        delete liveCommands[cmdId];
      }
    }

    new Notice(`Command "${cmdId}" is unavailable or its plugin is disabled.`);
    return false;
  }

  revertCommand(id) {
    const snap = this.originalSnapshot.get(id);
    const prevGroup = this.settings.commandOverrides[id]?.group || "";
    if (prevGroup) {
      this.settings.commandOverrides[id] = {
        customName: "",
        aliases: [],
        hidden: false,
        pinned: false,
        group: prevGroup
      };
    } else {
      delete this.settings.commandOverrides[id];
    }

    if (this.hiddenBackup.has(id)) {
      this.app.commands.commands[id] = this.hiddenBackup.get(id);
      this.hiddenBackup.delete(id);
    }

    if (snap && this.app.commands?.commands?.[id]) {
      this.app.commands.commands[id].name = snap.originalName;
    }

    this.syncAliases();
  }

  removeCommandById(fullId) {
    if (typeof this.app.commands?.removeCommand === "function") {
      this.app.commands.removeCommand(fullId);
    }
    if (this.app.commands?.commands && this.app.commands.commands[fullId]) {
      delete this.app.commands.commands[fullId];
    }
  }

  cleanOrphanedOverrides() {
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

  restoreAllOnUnload() {
    this.uninstallCommandInterceptors();

    const liveCommands = this.app.commands?.commands || {};
    for (const [id, cmd] of this.hiddenBackup.entries()) {
      liveCommands[id] = cmd;
    }
    this.hiddenBackup.clear();

    for (const [id, snap] of this.originalSnapshot.entries()) {
      if (liveCommands[id]) {
        liveCommands[id].name = snap.originalName;
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

    // Flush any pending debounced usage stats
    void this.plugin.saveData(this.settings);
  }

  importExternalConfigs() {
    let importedCount = 0;

    const cmdr = this.app.plugins?.plugins?.["cmdr"];
    if (cmdr?.settings) {
      const cs = cmdr.settings;
      if (Array.isArray(cs.hide?.commands)) {
        cs.hide.commands.forEach((id) => {
          const entry = this.ensureOverrideEntry(id);
          if (!entry.hidden) {
            entry.hidden = true;
            importedCount++;
          }
        });
      }
      if (Array.isArray(cs.macros)) {
        cs.macros.forEach((m, idx) => {
          const macroId = `cmdr-${idx}-${Date.now()}`;
          const steps = (m.commands || [])
            .map((s) => ({
              type: "command",
              commandId: s.id || s.commandId,
              text: "",
              delayMs: Number(s.delay) || 0
            }))
            .filter((s) => Boolean(s.commandId));

          if (steps.length > 0 && !this.settings.macros.some((ex) => ex.name === m.name)) {
            this.settings.macros.push({
              id: macroId,
              name: m.name || `Imported Macro ${idx + 1}`,
              icon: m.icon || "sparkles",
              aliases: [],
              loop: 1,
              steps
            });
            importedCount++;
          }
        });
      }

      const importBtnList = (arr, location) => {
        if (!Array.isArray(arr)) return;
        arr.forEach((b) => {
          const cmdId = b.id || b.commandId;
          if (!cmdId) return;
          const exists = this.settings.pinnedButtons.some(
            (p) => p.commandId === cmdId && p.location === location
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
              device: b.mode || "all",
              displayMode: "icon",
              tooltip: snap?.originalName || cmdId
            });
            importedCount++;
          }
        });
      };

      importBtnList(cs.pageHeader, "header");
      importBtnList(cs.statusBar, "statusbar");
      importBtnList(cs.leftRibbon, "ribbon");
      importBtnList(cs.editorMenu, "editor-menu");
      importBtnList(cs.fileMenu, "file-menu");
    }

    const bcp = this.app.plugins?.plugins?.["better-command-palette"];
    if (bcp?.settings) {
      const bs = bcp.settings;
      if (Array.isArray(bs.hiddenCommands)) {
        bs.hiddenCommands.forEach((id) => {
          const entry = this.ensureOverrideEntry(id);
          if (!entry.hidden) {
            entry.hidden = true;
            importedCount++;
          }
        });
      }
    }

    if (importedCount > 0) {
      this.scanAndSyncAll();
      this.plugin.buttonInjector.syncButtons();
    }
    return importedCount;
  }
}

class MacroEngine {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.runningMacros = new Set();
  }

  async runMacro(macroId) {
    if (this.runningMacros.has(macroId)) {
      new Notice("Macro is already running (loop prevented).");
      return;
    }

    const macro = (this.plugin.settings.macros || []).find((m) => m.id === macroId);
    if (!macro || !Array.isArray(macro.steps) || macro.steps.length === 0) {
      new Notice("Macro has no steps configured.");
      return;
    }

    const loops = Math.min(25, Math.max(1, Number(macro.loop) || 1));
    this.runningMacros.add(macroId);

    try {
      for (let i = 0; i < loops; i++) {
        for (const step of macro.steps) {
          const stepType = step.type || "command";

          if (stepType === "command" && step.commandId) {
            this.plugin.registry.executeCommandSafe(step.commandId);
          } else if (stepType === "text" && step.text) {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view?.editor) {
              const expanded = await expandMacroVariables(step.text, this.app);
              view.editor.replaceSelection(expanded);
            }
          } else if (stepType === "notice" && step.text) {
            const expanded = await expandMacroVariables(step.text, this.app);
            new Notice(expanded);
          } else if (stepType === "clipboard" && step.text) {
            const expanded = await expandMacroVariables(step.text, this.app);
            if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(expanded);
            }
          } else if (stepType === "uri" && step.text) {
            const expanded = await expandMacroVariables(step.text, this.app);
            const safeUri = validateSafeUri(expanded);
            if (safeUri) {
              window.open(safeUri);
            } else {
              new Notice(`CPM Security: Blocked unsafe or unverified URI scheme "${expanded}"`);
            }
          }

          const delay = Number(step.delayMs) || 0;
          if (delay > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, delay));
          }
        }
      }
      new Notice(`Completed macro: ${macro.name}`);
    } catch (err) {
      console.error("Macro execution error:", err);
      new Notice(`Error running macro "${macro.name}": ${err.message || err}`);
    } finally {
      this.runningMacros.delete(macroId);
    }
  }
}

class ButtonInjector {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.ribbonEls = [];
    this.statusBarEls = [];
  }

  isDeviceMatch(deviceMode) {
    if (!deviceMode || deviceMode === "all") return true;
    if (deviceMode === "desktop") return !Platform.isMobile;
    if (deviceMode === "mobile") return Boolean(Platform.isMobile);
    return true;
  }

  syncButtons() {
    this.clearInjectedButtons();
    const buttons = (this.plugin.settings.pinnedButtons || []).filter((b) =>
      this.isDeviceMatch(b.device)
    );

    buttons.forEach((btn) => {
      if (btn.location === "ribbon") {
        const el = this.plugin.addRibbonIcon(
          btn.icon || "terminal",
          btn.tooltip || btn.label || btn.commandId,
          () => this.plugin.registry.executeCommandSafe(btn.commandId)
        );
        el.addClass("cpm-injected-ribbon-btn");
        if (btn.color) el.style.color = btn.color;
        this.ribbonEls.push(el);
      } else if (btn.location === "statusbar") {
        const item = this.plugin.addStatusBarItem();
        item.addClass("cpm-statusbar-btn");
        const iconSpan = item.createSpan({ cls: "cpm-svg" });
        setIcon(iconSpan, btn.icon || "terminal");
        if (btn.color) iconSpan.style.color = btn.color;
        if (btn.displayMode === "both" && btn.label) {
          item.createSpan({ cls: "cpm-statusbar-label", text: btn.label });
        }
        setTooltip(item, btn.tooltip || btn.label || btn.commandId);
        item.addEventListener("click", () => {
          this.plugin.registry.executeCommandSafe(btn.commandId);
        });
        this.statusBarEls.push(item);
      }
    });

    this.injectHeaderButtons();
  }

  injectHeaderButtons() {
    const headerButtons = (this.plugin.settings.pinnedButtons || []).filter(
      (b) => b.location === "header" && this.isDeviceMatch(b.device)
    );

    this.app.workspace.iterateAllLeaves((leaf) => {
      const actionsContainer = leaf.view?.containerEl?.querySelector(".view-actions");
      if (!actionsContainer) return;

      let group = actionsContainer.querySelector(".cpm-header-actions-group");

      if (headerButtons.length === 0) {
        if (group) group.remove();
        return;
      }

      if (!group) {
        group = createDiv({ cls: "cpm-header-actions-group" });
        actionsContainer.prepend(group);
      } else {
        group.empty();
      }

      headerButtons.forEach((btn) => {
        const btnEl = group.createEl("button", {
          cls: "clickable-icon view-action cpm-header-btn"
        });
        const iconSpan = btnEl.createSpan({ cls: "cpm-svg" });
        setIcon(iconSpan, btn.icon || "terminal");
        if (btn.color) iconSpan.style.color = btn.color;

        if (btn.displayMode === "both" && btn.label) {
          btnEl.createSpan({ cls: "cpm-header-btn-label", text: btn.label });
        }

        setTooltip(btnEl, btn.tooltip || btn.label || btn.commandId);
        btnEl.addEventListener("click", (evt) => {
          evt.stopPropagation();
          this.plugin.registry.executeCommandSafe(btn.commandId);
        });
      });
    });
  }

  populateContextMenu(menu, locationType) {
    const matching = (this.plugin.settings.pinnedButtons || []).filter(
      (b) => b.location === locationType && this.isDeviceMatch(b.device)
    );
    if (matching.length === 0) return;

    menu.addSeparator();
    matching.forEach((btn) => {
      menu.addItem((item) => {
        item
          .setTitle(btn.label || btn.commandId)
          .setIcon(btn.icon || "terminal")
          .onClick(() => {
            this.plugin.registry.executeCommandSafe(btn.commandId);
          });
      });
    });
  }

  clearInjectedButtons() {
    this.ribbonEls.forEach((el) => {
      el.remove();
      this.app.workspace?.leftRibbon?.items?.remove?.(el);
    });
    this.ribbonEls = [];

    this.statusBarEls.forEach((el) => el.remove());
    this.statusBarEls = [];

    document.querySelectorAll(".cpm-header-actions-group").forEach((el) => el.remove());
  }
}

class CommandManagerUI {
  constructor(plugin, containerEl, isModal = true, onCloseModal = null) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.registry = plugin.registry;
    this.containerEl = containerEl;
    this.isModal = isModal;
    this.onCloseModal = onCloseModal;

    this.activeTab = "commands";
    this.searchQuery = "";
    this.selectedPlugin = "all";
    this.selectedGroup = "all";
    this.statusFilter = "all";
    this.groupingMode = "none";
    this.selectedCmdIds = new Set();
    this.lastClickedIdx = null;
    this.activeMacroId = null;
    this.newBtnIcon = "sparkles";
    this.newStepType = "command";
    this.renderLimit = 70;
    this.collapsedSections = new Set();
  }

  get settings() {
    return this.plugin.settings;
  }

  runDestructive(title, message, confirmLabel, actionFn) {
    if (!this.settings.confirmDestructive) {
      void actionFn();
      return;
    }
    new ConfirmModal(this.app, title, message, confirmLabel, actionFn).open();
  }

  async saveAndApply(rerender = true) {
    await this.plugin.saveSettings();
    this.registry.scanAndSyncAll();
    this.plugin.buttonInjector.syncButtons();
    if (rerender) this.render();
  }

  async restoreDefaultsAndAutoGroup() {
    DEFAULT_ACTION_GROUPS.forEach((g) => {
      if (!this.settings.actionGroups.includes(g)) {
        this.settings.actionGroups.push(g);
      }
    });

    DEFAULT_STARTER_BUTTONS.forEach((starter) => {
      const exists = this.settings.pinnedButtons.some(
        (b) => b.commandId === starter.commandId && b.location === starter.location
      );
      if (!exists) {
        this.settings.pinnedButtons.push({
          ...starter,
          id: `btn-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
        });
      }
    });

    const groupedCount = this.registry.autoGroupCommands(false);
    await this.saveAndApply(true);
    new Notice(
      `Restored default Action Groups, starter UI buttons, and auto-grouped ${groupedCount} command(s).`
    );
  }

  showToolsMenu(evt) {
    const menu = new Menu();

    // 1. Alias Prefix Modes
    const prefixModes = [
      { id: "source", label: "Prefix: Source Plugin (e.g. Note Toolbox: drop)" },
      { id: "none", label: "Prefix: Clean / None (e.g. drop)" },
      { id: "custom", label: `Prefix: Custom ("${this.settings.customAliasPrefix || "⚡"}: drop")` },
      { id: "manager", label: "Prefix: Command Palette Manager" }
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
                }
              ).open();
            } else {
              this.settings.aliasPrefixMode = pm.id;
              await this.saveAndApply(false);
              new Notice("Updated alias prefix mode.");
            }
          });
      });
    });

    menu.addSeparator();

    // 2. Feature Toggles
    menu.addItem((item) => {
      item
        .setTitle(`${this.settings.appendAliasesToOriginal ? "✓ " : ""}Append [aliases] to Command Name`)
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

    // 3. Maintenance & Import
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

    // 4. Export & Backup
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
                const parsed = JSON.parse(val);
                if (parsed && typeof parsed === "object") {
                  this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS, parsed);
                  await this.saveAndApply(true);
                  new Notice("Settings successfully imported!");
                }
              } catch (e) {
                new Notice("Invalid JSON format.");
              }
            }
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
            }
          );
        });
    });

    menu.showAtMouseEvent(evt);
  }

  render() {
    this.registry.scanAndSyncAll();
    this.containerEl.empty();
    const root = this.containerEl.createDiv({ cls: "cpm-root" });

    // Apply custom accent if enabled
    if (this.settings.accentThemeMode === "custom" && this.settings.customAccentColor) {
      root.style.setProperty("--cpm-accent", this.settings.customAccentColor);
      root.style.setProperty("--cpm-accent-hover", this.settings.customAccentColor);
    }

    // ROW 1: Compact Single-Line Header
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
        icon: "layers"
      },
      {
        id: "buttons",
        label: `UI Buttons (${(this.settings.pinnedButtons || []).length})`,
        icon: "pin"
      },
      {
        id: "macros",
        label: `Macros (${(this.settings.macros || []).length})`,
        icon: "sparkles"
      }
    ];

    tabs.forEach((t) => {
      const btn = navTabs.createEl("button", {
        cls: `cpm-nav-pill ${this.activeTab === t.id ? "is-active" : ""}`
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
        { id: "manager", label: "Prefix: Manager" }
      ].forEach((p) => {
        const opt = prefixSelect.createEl("option", { text: p.label, value: p.id });
        opt.selected = (this.settings.aliasPrefixMode || "source") === p.id;
      });
      prefixSelect.addEventListener("change", async () => {
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
            }
          ).open();
        } else {
          this.settings.aliasPrefixMode = prefixSelect.value;
          await this.saveAndApply(false);
          new Notice("Updated alias prefix format.");
        }
      });

      const styleSeg = rightControls.createDiv({ cls: "cpm-segmented" });
      [
        { id: "single", label: "1-Row", icon: "minus", tip: "Compact single-row layout" },
        { id: "double", label: "2-Row", icon: "rows", tip: "Balanced two-row card layout" },
        { id: "grid", label: "Grid", icon: "layout-grid", tip: "Multi-column grid tiles" }
      ].forEach((st) => {
        const segBtn = styleSeg.createEl("button", {
          cls: `cpm-seg-btn ${this.settings.cardStyle === st.id ? "is-active" : ""}`
        });
        setIcon(segBtn.createSpan({ cls: "cpm-svg" }), st.icon);
        segBtn.createSpan({ text: st.label });
        setTooltip(segBtn, st.tip);
        segBtn.addEventListener("click", async () => {
          this.settings.cardStyle = st.id;
          await this.saveAndApply(true);
        });
      });
    }

    if (this.settings.enableQuickPalette) {
      const qpBtn = rightControls.createEl("button", { cls: "cpm-btn cpm-btn-xs is-tonal" });
      setIcon(qpBtn.createSpan({ cls: "cpm-svg" }), "zap");
      qpBtn.createSpan({ text: "Quick Palette" });
      qpBtn.addEventListener("click", () => {
        if (this.isModal && this.onCloseModal) this.onCloseModal();
        new QuickCommandPaletteModal(this.app, this.plugin).open();
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
      closeBtn.addEventListener("click", () => this.onCloseModal());
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

  renderCommandsTab(container) {
    const allCommands = this.registry.getAllManagedCommands();

    const pluginMap = new Map();
    allCommands.forEach((c) => pluginMap.set(c.pluginId, c.pluginName));
    const sortedPlugins = Array.from(pluginMap.entries()).sort((a, b) =>
      a[1].localeCompare(b[1])
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
      cls: "cpm-input cpm-search-field"
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
      { id: "plugin", label: "Group: By Plugin" }
    ].forEach((m) => {
      const opt = groupModeSelect.createEl("option", { text: m.label, value: m.id });
      opt.selected = m.id === this.groupingMode;
    });

    const statusSelect = filterGrid.createEl("select", { cls: "cpm-select" });
    [
      { id: "all", label: "State: All" },
      { id: "pinned", label: "State: Starred (★)" },
      { id: "modified", label: "State: Modified / Aliased" },
      { id: "hidden", label: "State: Hidden Only" }
    ].forEach((s) => {
      const opt = statusSelect.createEl("option", { text: s.label, value: s.id });
      opt.selected = s.id === this.statusFilter;
    });

    const bulkToggleBtn = filterGrid.createEl("button", {
      cls: `cpm-btn cpm-btn-xs ${
        this.settings.bulkBarMode === "always" || this.selectedCmdIds.size > 0 ? "is-tonal" : ""
      }`
    });
    setIcon(bulkToggleBtn.createSpan({ cls: "cpm-svg" }), "check-square");
    bulkToggleBtn.createSpan({
      text: this.selectedCmdIds.size > 0 ? `${this.selectedCmdIds.size} Sel` : "Bulk"
    });
    setTooltip(bulkToggleBtn, "Toggle Bulk Action Bar (Always Visible vs Contextual)");
    bulkToggleBtn.addEventListener("click", async () => {
      this.settings.bulkBarMode =
        this.settings.bulkBarMode === "always" ? "contextual" : "always";
      await this.saveAndApply(true);
    });

    // Chip Strip
    const chipStrip = container.createDiv({ cls: "cpm-chip-strip" });
    const allGroups = [
      { id: "all", label: "All Groups" },
      ...(this.settings.actionGroups || []).map((g) => ({ id: g, label: g }))
    ];
    allGroups.forEach((g) => {
      const count =
        g.id === "all"
          ? allCommands.length
          : g.id === "Pinned"
          ? allCommands.filter((c) => c.pinned || c.group === "Pinned").length
          : allCommands.filter((c) => c.group === g.id).length;

      const chip = chipStrip.createEl("button", {
        cls: `cpm-chip ${this.selectedGroup === g.id ? "is-active" : ""}`
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
      new InputModal(this.app, "Create Action Group", "Group name (e.g. Daily Workflow)...", "", async (val) => {
        if (!this.settings.actionGroups.includes(val)) {
          this.settings.actionGroups.push(val);
          await this.saveAndApply(true);
        }
      }).open();
    });

    this.bulkBarContainer = container.createDiv({ cls: "cpm-bulk-wrap" });

    const listViewport = container.createDiv({
      cls: `cpm-viewport is-${this.settings.cardStyle || "single"}`
    });

    // Smooth Infinite scroll chunk loader
    listViewport.addEventListener("scroll", () => {
      if (
        this.groupingMode === "none" &&
        this.currentFilteredCommands &&
        this.renderLimit < this.currentFilteredCommands.length
      ) {
        const nearBottom =
          listViewport.scrollTop + listViewport.clientHeight >= listViewport.scrollHeight - 200;
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

    const debouncedSearch = debounce(() => {
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

  renderBulkBar(viewport) {
    if (!this.bulkBarContainer) return;
    this.bulkBarContainer.empty();

    const shouldShow =
      this.settings.bulkBarMode === "always" || this.selectedCmdIds.size > 0;
    if (!shouldShow) return;

    const bar = this.bulkBarContainer.createDiv({ cls: "cpm-bulk-bar" });
    const left = bar.createDiv({ cls: "cpm-row-group" });
    left.createSpan({
      cls: "cpm-pill-count",
      text: `${this.selectedCmdIds.size} selected`
    });

    left.createEl("button", { text: "All", cls: "cpm-btn cpm-btn-xs" }).addEventListener("click", () => {
      (this.currentFilteredCommands || []).forEach((c) => this.selectedCmdIds.add(c.id));
      this.renderListRows(viewport, this.registry.getAllManagedCommands(), false);
    });
    left.createEl("button", { text: "None", cls: "cpm-btn cpm-btn-xs" }).addEventListener("click", () => {
      this.selectedCmdIds.clear();
      this.renderListRows(viewport, this.registry.getAllManagedCommands(), false);
    });
    left.createEl("button", { text: "Invert", cls: "cpm-btn cpm-btn-xs" }).addEventListener("click", () => {
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
    bulkGroupSelect.addEventListener("change", async () => {
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
    });

    const hideBtn = right.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
    setIcon(hideBtn.createSpan({ cls: "cpm-svg" }), "eye-off");
    hideBtn.createSpan({ text: "Hide" });
    hideBtn.addEventListener("click", async () => {
      if (!this.selectedCmdIds.size) return new Notice("Select commands first.");
      this.selectedCmdIds.forEach((id) => {
        this.registry.ensureOverrideEntry(id).hidden = true;
      });
      await this.saveAndApply(false);
      this.renderListRows(viewport, this.registry.getAllManagedCommands(), false);
    });

    const unhideBtn = right.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
    setIcon(unhideBtn.createSpan({ cls: "cpm-svg" }), "eye");
    unhideBtn.createSpan({ text: "Show" });
    unhideBtn.addEventListener("click", async () => {
      if (!this.selectedCmdIds.size) return new Notice("Select commands first.");
      this.selectedCmdIds.forEach((id) => {
        this.registry.ensureOverrideEntry(id).hidden = false;
      });
      await this.saveAndApply(false);
      this.renderListRows(viewport, this.registry.getAllManagedCommands(), false);
    });

    const revertBtn = right.createEl("button", { cls: "cpm-btn cpm-btn-xs is-danger" });
    setIcon(revertBtn.createSpan({ cls: "cpm-svg" }), "rotate-ccw");
    revertBtn.createSpan({ text: "Revert" });
    revertBtn.addEventListener("click", () => {
      if (!this.selectedCmdIds.size) return new Notice("Select commands first.");
      this.runDestructive(
        "Revert Selected Commands?",
        `Restore ${this.selectedCmdIds.size} command(s) to original default names, aliases, and visibility?`,
        "Revert",
        async () => {
          this.selectedCmdIds.forEach((id) => this.registry.revertCommand(id));
          this.selectedCmdIds.clear();
          await this.saveAndApply(false);
          this.renderListRows(viewport, this.registry.getAllManagedCommands(), false);
        }
      );
    });
  }

  renderListRows(viewport, allCommands, resetScroll = true) {
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
        if (!matchCurrent && !matchOrig && !matchId && !matchPlugin && !matchHotkey && !matchAlias) {
          return false;
        }
      }
      return true;
    });

    this.renderBulkBar(viewport);

    if (this.currentFilteredCommands.length === 0) {
      viewport.createDiv({
        cls: "cpm-empty",
        text: "No commands match your current filters."
      });
      return;
    }

    if (this.groupingMode === "action" || this.groupingMode === "plugin") {
      const buckets = new Map();
      this.currentFilteredCommands.forEach((cmd, idx) => {
        const key =
          this.groupingMode === "action"
            ? cmd.group || "Ungrouped"
            : cmd.pluginName || "Other";
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push({ cmd, idx });
      });

      // Expand / Collapse all button
      const topActionRow = viewport.createDiv({ cls: "cpm-group-toolbar" });
      const toggleAllBtn = topActionRow.createEl("button", {
        cls: "cpm-btn cpm-btn-xs is-tonal",
        text: this.collapsedSections.size > 0 ? "Expand All Sections" : "Collapse All Sections"
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
          cls: `cpm-section-head ${isCollapsed ? "is-collapsed" : ""}`
        });

        const chevron = divider.createSpan({ cls: "cpm-section-chevron cpm-svg" });
        setIcon(chevron, isCollapsed ? "chevron-right" : "chevron-down");

        setIcon(
          divider.createSpan({ cls: "cpm-svg" }),
          this.groupingMode === "action" ? "layers" : "puzzle"
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

  buildCommandItem(viewport, cmd, idx) {
    const isSelected = this.selectedCmdIds.has(cmd.id);
    const styleMode = this.settings.cardStyle || "single";
    const card = viewport.createDiv({
      cls: `cpm-item is-${styleMode} ${isSelected ? "is-selected" : ""} ${
        cmd.hidden ? "is-hidden-cmd" : ""
      }`
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
      cls: `cpm-icon-btn cpm-star-btn ${cmd.pinned ? "is-starred" : ""}`
    });
    setIcon(starBtn, "star");
    setTooltip(starBtn, cmd.pinned ? "Unpin from Starred" : "Star / Pin command to top");
    starBtn.addEventListener("click", async () => {
      const entry = this.registry.ensureOverrideEntry(cmd.id);
      cmd.pinned = !cmd.pinned;
      entry.pinned = cmd.pinned;
      starBtn.toggleClass("is-starred", cmd.pinned);
      await this.saveAndApply(false);
    });

    if (this.settings.showPluginBadges) {
      const pluginTag = primary.createSpan({
        cls: "cpm-plugin-tag",
        text: cmd.pluginName
      });
      pluginTag.title = `ID: ${cmd.id}`;
    }

    const titleWrap = primary.createDiv({ cls: "cpm-title-col" });
    const nameInput = titleWrap.createEl("input", {
      type: "text",
      value: cmd.currentName,
      cls: "cpm-name-input"
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

    nameInput.addEventListener("blur", commitRename);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        nameInput.blur();
      }
    });

    if (cmd.customName && cmd.customName !== cmd.originalName) {
      titleWrap.createSpan({
        cls: "cpm-orig-note",
        text: `Default: ${cmd.originalName}`
      });
    }

    if (this.settings.showHotkeys && cmd.hotkey) {
      const hkBadge = primary.createSpan({
        cls: "cpm-kbd-badge",
        text: cmd.hotkey
      });
      setTooltip(hkBadge, "Click to configure hotkey in Obsidian Settings");
      hkBadge.addEventListener("click", () => {
        this.registry.openHotkeySettingsFor(cmd.currentName);
      });
    }

    if (cmd.runs && cmd.runs > 0) {
      primary.createSpan({
        cls: "cpm-usage-pill",
        text: `${cmd.runs} runs`
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
      del.addEventListener("click", async () => {
        const entry = this.registry.ensureOverrideEntry(cmd.id);
        entry.aliases.splice(aIdx, 1);
        await this.saveAndApply(false);
        this.renderListRows(viewport, this.registry.getAllManagedCommands(), false);
      });
    });

    const aliasInput = aliasZone.createEl("input", {
      type: "text",
      placeholder: "+ alias...",
      cls: "cpm-alias-field"
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
    aliasInput.addEventListener("blur", commitAlias);

    const controlsZone = secondary.createDiv({ cls: "cpm-controls-zone" });

    const groupSelect = controlsZone.createEl("select", { cls: "cpm-select cpm-select-xs" });
    groupSelect.createEl("option", { text: "No Group", value: "" });
    (this.settings.actionGroups || []).forEach((g) => {
      const opt = groupSelect.createEl("option", { text: g, value: g });
      opt.selected = cmd.group === g;
    });
    groupSelect.addEventListener("change", async () => {
      const entry = this.registry.ensureOverrideEntry(cmd.id);
      entry.group = groupSelect.value;
      cmd.group = groupSelect.value;
      await this.saveAndApply(false);
    });

    const runBtn = controlsZone.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
    setIcon(runBtn.createSpan({ cls: "cpm-svg" }), "play");
    runBtn.createSpan({ text: "Run" });
    setTooltip(runBtn, "Execute command now");
    runBtn.addEventListener("click", () => {
      this.registry.executeCommandSafe(cmd.id);
    });

    const hideBtn = controlsZone.createEl("button", {
      cls: `cpm-btn cpm-btn-xs ${cmd.hidden ? "is-warn" : ""}`
    });
    const hideIconSpan = hideBtn.createSpan({ cls: "cpm-svg" });
    setIcon(hideIconSpan, cmd.hidden ? "eye-off" : "eye");
    const hideTextSpan = hideBtn.createSpan({ text: cmd.hidden ? "Hidden" : "Visible" });
    setTooltip(hideBtn, "Toggle command visibility in Command Palette");
    hideBtn.addEventListener("click", async () => {
      const entry = this.registry.ensureOverrideEntry(cmd.id);
      cmd.hidden = !cmd.hidden;
      entry.hidden = cmd.hidden;
      card.toggleClass("is-hidden-cmd", cmd.hidden);
      hideBtn.toggleClass("is-warn", cmd.hidden);
      setIcon(hideIconSpan, cmd.hidden ? "eye-off" : "eye");
      hideTextSpan.setText(cmd.hidden ? "Hidden" : "Visible");
      await this.saveAndApply(false);
    });

    const pinBtn = controlsZone.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
    setIcon(pinBtn.createSpan({ cls: "cpm-svg" }), "pin");
    pinBtn.createSpan({ text: "Pin UI" });
    setTooltip(pinBtn, "Pin as UI Button (Header, Ribbon, Status Bar, or Menu)");
    pinBtn.addEventListener("click", async () => {
      this.settings.pinnedButtons.push({
        id: `btn-${Date.now()}`,
        commandId: cmd.id,
        icon: cmd.icon || "terminal",
        label: cmd.currentName,
        location: "header",
        color: "",
        device: "all",
        displayMode: "icon",
        tooltip: cmd.currentName
      });
      await this.saveAndApply(false);
      new Notice(`Pinned "${cmd.currentName}" to Note Header.`);
    });

    const revertBtn = controlsZone.createEl("button", {
      cls: `cpm-btn cpm-btn-xs ${cmd.isModified ? "is-tonal" : ""}`,
      attr: { disabled: !cmd.isModified ? "true" : null }
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
        }
      );
    });
  }

  renderGroupsTab(container) {
    const bar = container.createDiv({ cls: "cpm-toolbar-row" });
    const input = bar.createEl("input", {
      type: "text",
      placeholder: "Create new Action Group (e.g. Daily Workflow)...",
      cls: "cpm-input cpm-flex-1"
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
    addBtn.addEventListener("click", handleAdd);
    input.addEventListener("keydown", (e) => e.key === "Enter" && handleAdd());

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
        cls: "cpm-name-input"
      });
      nameIn.addEventListener("blur", async () => {
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
      });

      const right = row.createDiv({ cls: "cpm-row-group" });
      right.createSpan({ cls: "cpm-pill-count", text: `${count} command(s)` });

      const assignBtn = right.createEl("button", { cls: "cpm-btn cpm-btn-xs is-tonal" });
      setIcon(assignBtn.createSpan({ cls: "cpm-svg" }), "plus");
      assignBtn.createSpan({ text: "Assign Commands" });
      assignBtn.addEventListener("click", () => {
        new AssignCommandsToGroupModal(this.app, this.plugin, groupName, () => this.render()).open();
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
          }
        );
      });
    });
  }

  renderButtonsTab(container) {
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
      { id: "file-menu", label: "File Explorer Menu" }
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
    pinBtn.addEventListener("click", async () => {
      const targetId = cmdSelect.value;
      if (!targetId) return new Notice("Select a command or macro first.");

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
        location: locSelect.value,
        color: "",
        device: "all",
        displayMode: "icon",
        tooltip: label
      });
      await this.saveAndApply(true);
    });

    const list = container.createDiv({ cls: "cpm-viewport is-single" });
    const buttons = this.settings.pinnedButtons || [];
    if (buttons.length === 0) {
      const empty = list.createDiv({ cls: "cpm-empty" });
      empty.createEl("p", { text: "No UI buttons pinned." });
      const restoreBtn = empty.createEl("button", {
        cls: "cpm-btn is-primary",
        text: "Restore Starter UI Buttons"
      });
      restoreBtn.addEventListener("click", () => void this.restoreDefaultsAndAutoGroup());
      return;
    }

    buttons.forEach((btn, idx) => {
      const row = list.createDiv({ cls: "cpm-flat-card" });
      const left = row.createDiv({ cls: "cpm-row-group cpm-flex-1" });

      // Move Up / Move Down buttons
      const reorderGroup = left.createDiv({ cls: "cpm-reorder-btn-group" });
      const upBtn = reorderGroup.createEl("button", {
        cls: "cpm-icon-btn cpm-btn-micro",
        attr: { disabled: idx === 0 ? "true" : null }
      });
      setIcon(upBtn, "chevron-up");
      upBtn.addEventListener("click", async () => {
        if (idx === 0) return;
        const arr = this.settings.pinnedButtons;
        [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
        await this.saveAndApply(true);
      });

      const downBtn = reorderGroup.createEl("button", {
        cls: "cpm-icon-btn cpm-btn-micro",
        attr: { disabled: idx >= buttons.length - 1 ? "true" : null }
      });
      setIcon(downBtn, "chevron-down");
      downBtn.addEventListener("click", async () => {
        if (idx >= buttons.length - 1) return;
        const arr = this.settings.pinnedButtons;
        [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
        await this.saveAndApply(true);
      });

      const iconBtn = left.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
      const icSpan = iconBtn.createSpan({ cls: "cpm-svg" });
      setIcon(icSpan, btn.icon || "terminal");
      if (btn.color) icSpan.style.color = btn.color;
      iconBtn.createSpan({ text: btn.icon || "terminal" });
      iconBtn.addEventListener("click", () => {
        new VisualIconPickerModal(this.app, btn.icon, async (chosen) => {
          btn.icon = chosen;
          await this.saveAndApply(true);
        }).open();
      });

      const colorIn = left.createEl("input", {
        type: "color",
        value: btn.color || "#00a884",
        cls: "cpm-color-picker"
      });
      setTooltip(colorIn, "Custom icon tint");
      colorIn.addEventListener("change", async () => {
        btn.color = colorIn.value;
        await this.saveAndApply(true);
      });

      const labelIn = left.createEl("input", {
        type: "text",
        value: btn.label,
        cls: "cpm-name-input"
      });
      labelIn.addEventListener("blur", async () => {
        btn.label = labelIn.value.trim() || btn.commandId;
        await this.saveAndApply(true);
      });

      const right = row.createDiv({ cls: "cpm-row-group" });

      const locPicker = right.createEl("select", { cls: "cpm-select cpm-select-xs" });
      [
        { id: "header", label: "Note Header" },
        { id: "ribbon", label: "Left Ribbon" },
        { id: "statusbar", label: "Status Bar" },
        { id: "editor-menu", label: "Editor Context Menu" },
        { id: "file-menu", label: "File Explorer Menu" }
      ].forEach((l) => {
        const opt = locPicker.createEl("option", { text: l.label, value: l.id });
        opt.selected = btn.location === l.id;
      });
      locPicker.addEventListener("change", async () => {
        btn.location = locPicker.value;
        await this.saveAndApply(true);
      });

      const modePicker = right.createEl("select", { cls: "cpm-select cpm-select-xs" });
      [
        { id: "icon", label: "Icon Only" },
        { id: "both", label: "Icon + Label" }
      ].forEach((m) => {
        const opt = modePicker.createEl("option", { text: m.label, value: m.id });
        opt.selected = (btn.displayMode || "icon") === m.id;
      });
      modePicker.addEventListener("change", async () => {
        btn.displayMode = modePicker.value;
        await this.saveAndApply(true);
      });

      const devPicker = right.createEl("select", { cls: "cpm-select cpm-select-xs" });
      [
        { id: "all", label: "All Devices" },
        { id: "desktop", label: "Desktop" },
        { id: "mobile", label: "Mobile" }
      ].forEach((d) => {
        const opt = devPicker.createEl("option", { text: d.label, value: d.id });
        opt.selected = (btn.device || "all") === d.id;
      });
      devPicker.addEventListener("change", async () => {
        btn.device = devPicker.value;
        await this.saveAndApply(true);
      });

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
          }
        );
      });
    });
  }

  renderMacrosTab(container) {
    const macros = this.settings.macros || [];
    if (!this.activeMacroId && macros.length > 0) {
      this.activeMacroId = macros[0].id;
    }

    const tplBar = container.createDiv({ cls: "cpm-bulk-bar" });
    tplBar.createSpan({ cls: "cpm-alias-label", text: "1-Click Starter Templates:" });
    const tplBtns = tplBar.createDiv({ cls: "cpm-row-group" });
    MACRO_TEMPLATES.forEach((tpl) => {
      const b = tplBtns.createEl("button", { cls: "cpm-btn cpm-btn-xs is-tonal" });
      setIcon(b.createSpan({ cls: "cpm-svg" }), tpl.icon);
      b.createSpan({ text: `+ ${tpl.name}` });
      setTooltip(b, tpl.desc);
      b.addEventListener("click", async () => {
        const id = `m-${Date.now()}`;
        this.settings.macros.push({
          id,
          name: tpl.name,
          icon: tpl.icon,
          aliases: [...tpl.aliases],
          loop: tpl.loop || 1,
          steps: tpl.steps.map((s) => ({ ...s }))
        });
        this.activeMacroId = id;
        await this.saveAndApply(true);
      });
    });

    const chipRow = container.createDiv({ cls: "cpm-chip-strip" });
    macros.forEach((m) => {
      const chip = chipRow.createEl("button", {
        cls: `cpm-chip ${m.id === this.activeMacroId ? "is-active" : ""}`
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
      new InputModal(this.app, "Create New Macro", "Macro name...", "", async (name) => {
        const id = `m-${Date.now()}`;
        this.settings.macros.push({
          id,
          name,
          icon: "sparkles",
          aliases: [],
          loop: 1,
          steps: []
        });
        this.activeMacroId = id;
        await this.saveAndApply(true);
      }).open();
    });

    const activeMacro = macros.find((m) => m.id === this.activeMacroId);
    if (!activeMacro) {
      container.createDiv({
        cls: "cpm-empty",
        text: "Click a 1-Click Starter Template above or '+ New Macro' to chain commands, text snippets, delays, and notices."
      });
      return;
    }

    const configBar = container.createDiv({ cls: "cpm-toolbar-row" });
    const iconBtn = configBar.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
    setIcon(iconBtn.createSpan({ cls: "cpm-svg" }), activeMacro.icon || "sparkles");
    iconBtn.createSpan({ text: activeMacro.icon || "sparkles" });
    iconBtn.addEventListener("click", () => {
      new VisualIconPickerModal(this.app, activeMacro.icon, async (chosen) => {
        activeMacro.icon = chosen;
        await this.saveAndApply(true);
      }).open();
    });

    const nameIn = configBar.createEl("input", {
      type: "text",
      value: activeMacro.name,
      cls: "cpm-input"
    });
    nameIn.addEventListener("blur", async () => {
      activeMacro.name = nameIn.value.trim() || activeMacro.name;
      await this.saveAndApply(true);
    });

    const aliasIn = configBar.createEl("input", {
      type: "text",
      placeholder: "Aliases (e.g. sr, clean)",
      value: (activeMacro.aliases || []).join(", "),
      cls: "cpm-input cpm-flex-1"
    });
    aliasIn.addEventListener("blur", async () => {
      activeMacro.aliases = aliasIn.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await this.saveAndApply(false);
    });

    configBar.createSpan({ cls: "cpm-alias-label", text: "Loop:" });
    const loopIn = configBar.createEl("input", {
      type: "number",
      value: String(activeMacro.loop || 1),
      cls: "cpm-input cpm-num-input"
    });
    loopIn.addEventListener("change", async () => {
      activeMacro.loop = Math.min(25, Math.max(1, Number(loopIn.value) || 1));
      await this.saveAndApply(false);
    });

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
          this.activeMacroId = macros[0]?.id || null;
          await this.saveAndApply(true);
        }
      );
    });

    // Step Builder Bar
    const stepBar = container.createDiv({ cls: "cpm-toolbar-row" });
    const typeSelect = stepBar.createEl("select", { cls: "cpm-select" });
    [
      { id: "command", label: "Step: Run Command" },
      { id: "text", label: "Step: Insert Text / Template" },
      { id: "notice", label: "Step: Toast Notification" },
      { id: "clipboard", label: "Step: Copy to Clipboard" },
      { id: "uri", label: "Step: Open URL / URI" }
    ].forEach((t) => {
      const opt = typeSelect.createEl("option", { text: t.label, value: t.id });
      opt.selected = this.newStepType === t.id;
    });
    typeSelect.addEventListener("change", () => {
      this.newStepType = typeSelect.value;
      this.render();
    });

    const allCmds = this.registry.getAllManagedCommands();
    let stepCmdSelect = null;
    let stepTextInput = null;

    if (this.newStepType === "command") {
      stepCmdSelect = stepBar.createEl("select", { cls: "cpm-select cpm-flex-1" });
      stepCmdSelect.createEl("option", { text: "Choose command to execute...", value: "" });
      allCmds.forEach((c) => {
        stepCmdSelect.createEl("option", {
          text: `${c.pluginName}: ${c.currentName}`,
          value: c.id
        });
      });
    } else {
      stepTextInput = stepBar.createEl("input", {
        type: "text",
        placeholder:
          this.newStepType === "text"
            ? "Text to insert (supports {{date}}, {{time}}, {{title}}, {{selection}})..."
            : this.newStepType === "notice"
            ? "Toast notice message..."
            : this.newStepType === "clipboard"
            ? "Text to copy to clipboard..."
            : "URL or obsidian:// URI to open...",
        cls: "cpm-input cpm-flex-1"
      });
    }

    const delayIn = stepBar.createEl("input", {
      type: "number",
      placeholder: "Wait ms",
      value: "80",
      cls: "cpm-input cpm-num-input"
    });

    const addStepBtn = stepBar.createEl("button", { cls: "cpm-btn is-primary" });
    setIcon(addStepBtn.createSpan({ cls: "cpm-svg" }), "plus");
    addStepBtn.createSpan({ text: "Add Step" });
    addStepBtn.addEventListener("click", async () => {
      if (this.newStepType === "command") {
        if (!stepCmdSelect?.value) return new Notice("Choose a command first.");
        activeMacro.steps.push({
          type: "command",
          commandId: stepCmdSelect.value,
          text: "",
          delayMs: Math.max(0, Number(delayIn.value) || 0)
        });
      } else {
        if (!stepTextInput?.value) return new Notice("Enter text for this step.");
        activeMacro.steps.push({
          type: this.newStepType,
          commandId: "",
          text: stepTextInput.value,
          delayMs: Math.max(0, Number(delayIn.value) || 0)
        });
      }
      await this.saveAndApply(true);
    });

    // Dynamic Variables Pills Helper (when adding text)
    if (this.newStepType === "text" && stepTextInput) {
      const varPills = container.createDiv({ cls: "cpm-var-pills" });
      varPills.createSpan({ text: "Quick Tags: ", cls: "cpm-alias-label" });
      ["{{date}}", "{{time}}", "{{datetime}}", "{{title}}", "{{selection}}", "{{clipboard}}"].forEach(
        (tag) => {
          const pill = varPills.createEl("button", {
            cls: "cpm-alias-pill cpm-btn-micro",
            text: tag
          });
          pill.addEventListener("click", () => {
            stepTextInput.value += tag;
            stepTextInput.focus();
          });
        }
      );
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
        left.createSpan({ text: info ? `${info.pluginName}: ${info.currentName}` : step.commandId });
      } else {
        left.createSpan({ text: `"${step.text}"` });
      }

      const right = row.createDiv({ cls: "cpm-row-group" });
      right.createSpan({ cls: "cpm-alias-label", text: "Wait (ms):" });
      const dIn = right.createEl("input", {
        type: "number",
        value: String(step.delayMs || 0),
        cls: "cpm-input cpm-num-input"
      });
      dIn.addEventListener("change", async () => {
        step.delayMs = Math.max(0, Number(dIn.value) || 0);
        await this.saveAndApply(false);
      });

      const upBtn = right.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
      setIcon(upBtn.createSpan({ cls: "cpm-svg" }), "chevron-up");
      upBtn.addEventListener("click", async () => {
        if (sIdx === 0) return;
        const arr = activeMacro.steps;
        [arr[sIdx - 1], arr[sIdx]] = [arr[sIdx], arr[sIdx - 1]];
        await this.saveAndApply(true);
      });

      const downBtn = right.createEl("button", { cls: "cpm-btn cpm-btn-xs" });
      setIcon(downBtn.createSpan({ cls: "cpm-svg" }), "chevron-down");
      downBtn.addEventListener("click", async () => {
        const arr = activeMacro.steps;
        if (sIdx >= arr.length - 1) return;
        [arr[sIdx + 1], arr[sIdx]] = [arr[sIdx], arr[sIdx + 1]];
        await this.saveAndApply(true);
      });

      const delBtn = right.createEl("button", { cls: "cpm-btn cpm-btn-xs is-danger" });
      setIcon(delBtn.createSpan({ cls: "cpm-svg" }), "trash-2");
      delBtn.addEventListener("click", async () => {
        activeMacro.steps.splice(sIdx, 1);
        await this.saveAndApply(true);
      });
    });
  }
}

class CommandManagerModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    this.modalEl.addClass("cpm-modal-window");
    const { contentEl } = this;
    contentEl.empty();
    new CommandManagerUI(this.plugin, contentEl, true, () => this.close()).render();
  }

  onClose() {
    this.contentEl.empty();
  }
}

class CommandManagerSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    // Hero Quick Launcher
    const hero = containerEl.createDiv({ cls: "cpm-settings-hero" });
    const heroLeft = hero.createDiv({ cls: "cpm-hero-left" });
    const heroIcon = heroLeft.createSpan({ cls: "cpm-hero-icon" });
    setIcon(heroIcon, "command");
    const heroText = heroLeft.createDiv();
    heroText.createEl("h3", { text: "Command Palette Manager" });
    heroText.createEl("p", {
      text: "Visual command manager: add multiple aliases to any plugin command, rename & revert, hide commands, group by action, pin UI buttons, and build macros."
    });

    const heroActions = hero.createDiv({ cls: "cpm-hero-actions" });
    const openMgrBtn = heroActions.createEl("button", {
      cls: "cpm-btn is-primary",
      text: "Open Full Manager Modal"
    });
    setIcon(openMgrBtn.createSpan({ cls: "cpm-svg" }), "layout");
    openMgrBtn.addEventListener("click", () => {
      new CommandManagerModal(this.app, this.plugin).open();
    });

    const openQpBtn = heroActions.createEl("button", {
      cls: "cpm-btn is-tonal",
      text: "Quick Palette"
    });
    setIcon(openQpBtn.createSpan({ cls: "cpm-svg" }), "zap");
    openQpBtn.addEventListener("click", () => {
      new QuickCommandPaletteModal(this.app, this.plugin).open();
    });

    const prefBox = containerEl.createDiv({ cls: "cpm-settings-prefs" });

    new Setting(prefBox)
      .setName("Command Alias Prefix Mode")
      .setDesc("Choose what prefix appears before aliases in the Command Palette and / Slash menu.")
      .addDropdown((dd) => {
        dd.addOption("source", "Original Plugin Name (e.g. Note Toolbox: dropdown)")
          .addOption("none", "No Prefix — Clean Alias Only (e.g. dropdown)")
          .addOption("custom", "Custom Prefix Text")
          .addOption("manager", "Command Palette Manager")
          .setValue(this.plugin.settings.aliasPrefixMode || "source")
          .onChange(async (val) => {
            this.plugin.settings.aliasPrefixMode = val;
            await this.plugin.saveSettings();
            this.plugin.registry.syncAliases();
            this.plugin.registry.syncMacros();
            this.display();
          });
      });

    if (this.plugin.settings.aliasPrefixMode === "custom") {
      new Setting(prefBox)
        .setName("Custom Alias Prefix Text")
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
      .setName("Color Accent Theme")
      .setDesc("Adapt to active Obsidian Theme colors, or choose a custom highlight accent.")
      .addDropdown((dd) => {
        dd.addOption("theme", "Follow Active Obsidian Theme Accent (Adaptive)")
          .addOption("custom", "Custom Accent Color")
          .setValue(this.plugin.settings.accentThemeMode || "theme")
          .onChange(async (val) => {
            this.plugin.settings.accentThemeMode = val;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    if (this.plugin.settings.accentThemeMode === "custom") {
      new Setting(prefBox)
        .setName("Custom Accent Color")
        .setDesc("Choose your custom color accent.")
        .addColorPicker((cp) => {
          cp.setValue(this.plugin.settings.customAccentColor || "#00a884").onChange(async (val) => {
            this.plugin.settings.customAccentColor = val;
            await this.plugin.saveSettings();
          });
        });
    }

    new Setting(prefBox)
      .setName("Command Card Display Style")
      .setDesc("Switch between 1-Row Compact, 2-Row Balanced, or Multi-Column Grid Tiles.")
      .addDropdown((dd) => {
        dd.addOption("single", "1-Row Compact (Recommended)")
          .addOption("double", "2-Row Balanced Card")
          .addOption("grid", "Grid Tiles")
          .setValue(this.plugin.settings.cardStyle || "single")
          .onChange(async (val) => {
            this.plugin.settings.cardStyle = val;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    new Setting(prefBox)
      .setName("Quick Palette Default Sort")
      .setDesc("Choose how commands are prioritized in the Quick Command Palette popup.")
      .addDropdown((dd) => {
        dd.addOption("frequency", "Most Used (Usage Frequency)")
          .addOption("recent", "Recently Executed")
          .addOption("pinned", "Starred Commands First")
          .addOption("alpha", "Alphabetical (A-Z)")
          .setValue(this.plugin.settings.quickPaletteSort || "frequency")
          .onChange(async (val) => {
            this.plugin.settings.quickPaletteSort = val;
            await this.plugin.saveSettings();
          });
      });

    new Setting(prefBox)
      .setName("Bulk Action Toolbar Behavior")
      .setDesc("Choose whether the bulk action bar stays visible or auto-hides until you check a box.")
      .addDropdown((dd) => {
        dd.addOption("contextual", "Contextual (Auto-Hide until checked)")
          .addOption("always", "Always Visible")
          .setValue(this.plugin.settings.bulkBarMode || "contextual")
          .onChange(async (val) => {
            this.plugin.settings.bulkBarMode = val;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    new Setting(prefBox)
      .setName("Append Aliases to Original Command Name")
      .setDesc("Also appends [alias1, alias2] to the original command entry so both are searchable.")
      .addToggle((tog) => {
        tog.setValue(Boolean(this.plugin.settings.appendAliasesToOriginal)).onChange(async (val) => {
          this.plugin.settings.appendAliasesToOriginal = val;
          await this.plugin.saveSettings();
          this.plugin.registry.syncOverrides();
          this.display();
        });
      });

    new Setting(prefBox)
      .setName("Show Keyboard Shortcut Badges")
      .setDesc("Display assigned hotkeys on each command card with 1-click jump to Hotkey settings.")
      .addToggle((tog) => {
        tog.setValue(Boolean(this.plugin.settings.showHotkeys)).onChange(async (val) => {
          this.plugin.settings.showHotkeys = val;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    new Setting(prefBox)
      .setName("Show Source Plugin Badges")
      .setDesc("Show the plugin name badge next to each command title.")
      .addToggle((tog) => {
        tog.setValue(Boolean(this.plugin.settings.showPluginBadges)).onChange(async (val) => {
          this.plugin.settings.showPluginBadges = val;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    new Setting(prefBox)
      .setName("Confirm Before Revert or Delete")
      .setDesc("Show a confirmation warning before reverting commands or deleting groups/buttons/macros.")
      .addToggle((tog) => {
        tog.setValue(Boolean(this.plugin.settings.confirmDestructive)).onChange(async (val) => {
          this.plugin.settings.confirmDestructive = val;
          await this.plugin.saveSettings();
        });
      });

    new Setting(prefBox)
      .setName("Frosted Glassmorphism Theme")
      .setDesc("Enable translucent glass panels with frosted blur backdrops and subtle luminous borders.")
      .addToggle((tog) => {
        tog.setValue(Boolean(this.plugin.settings.glassmorphism)).onChange(async (val) => {
          this.plugin.settings.glassmorphism = val;
          await this.plugin.saveSettings();
          this.plugin.applyThemePreferences();
        });
      });

    new Setting(prefBox)
      .setName("Enable Quick Command Palette Modal")
      .setDesc("Enables the fast Quick Command Palette popup with Pinned, Recent, Alias, and Group filtering.")
      .addToggle((tog) => {
        tog.setValue(Boolean(this.plugin.settings.enableQuickPalette)).onChange(async (val) => {
          this.plugin.settings.enableQuickPalette = val;
          await this.plugin.saveSettings();
          this.display();
        });
      });
  }
}

module.exports = class CommandPaletteManagerPlugin extends Plugin {
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
      callback: () => {
        new CommandManagerModal(this.app, this).open();
      }
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
      }
    });

    this.addRibbonIcon("command", "Command Palette Manager", () => {
      new CommandManagerModal(this.app, this).open();
    });

    this.app.workspace.onLayoutReady(() => {
      this.registry.scanAndSyncAll();
      this.buttonInjector.syncButtons();
    });

    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.buttonInjector.injectHeaderButtons())
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.buttonInjector.injectHeaderButtons())
    );

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu) => {
        this.buttonInjector.populateContextMenu(menu, "editor-menu");
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu) => {
        this.buttonInjector.populateContextMenu(menu, "file-menu");
      })
    );

    this.addSettingTab(new CommandManagerSettingTab(this.app, this));
  }

  // --- Public Inter-Plugin API Methods ---
  openManager() {
    new CommandManagerModal(this.app, this).open();
  }

  openQuickPalette() {
    new QuickCommandPaletteModal(this.app, this).open();
  }

  executeCommand(cmdId) {
    return this.registry.executeCommandSafe(cmdId);
  }

  runMacro(macroId) {
    return this.macroEngine.runMacro(macroId);
  }

  addCommandAlias(cmdId, alias) {
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
    if (typeof document !== "undefined") {
      document.body.removeClass("cpm-glassmorphic");
    }
    this.registry?.restoreAllOnUnload();
    this.buttonInjector?.clearInjectedButtons();
  }

  getBackupFilePath() {
    return normalizePath(
      `${this.app.vault.configDir}/plugins/${this.manifest.id}/backup.json`
    );
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
      const parsed = JSON.parse(raw);
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
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
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
};