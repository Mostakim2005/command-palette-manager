import { MarkdownView, Notice } from "obsidian";
import type { App } from "obsidian";
import { validateSafeUri } from "./fuzzy";
import { expandMacroVariables } from "./macro-variables";
import type CommandPaletteManagerPlugin from "./main";

/**
 * Sequential macro runner.
 * Six step types are supported; every text-bearing step runs through
 * `expandMacroVariables` so `{{date}}` / `{{prompt:...}}` work everywhere.
 */
export class MacroEngine {
	runningMacros = new Set<string>();

	constructor(
		public app: App,
		public plugin: CommandPaletteManagerPlugin,
	) {}

	async runMacro(macroId: string): Promise<void> {
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
							new Notice(
								`CPM Security: Blocked unsafe or unverified URI scheme "${expanded}"`,
							);
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
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Error running macro "${macro.name}": ${message}`);
		} finally {
			this.runningMacros.delete(macroId);
		}
	}
}
