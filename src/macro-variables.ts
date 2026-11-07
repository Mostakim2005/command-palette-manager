import { MarkdownView } from "obsidian";
import type { App } from "obsidian";
import { TextPromptModal } from "./modals";

/**
 * Expands dynamic variables in macro text snippets.
 * Supports date/time tokens, active-note context, clipboard, uuid and `{{prompt:Label}}`.
 */
export async function expandMacroVariables(text: string, app: App): Promise<string> {
	if (!text) return "";
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
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
			activeFolder = activeView.file.parent?.name ?? "";
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
		.replace(
			/\{\{uuid\}\}/gi,
			Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
		);

	// Interactive {{prompt:Prompt Label}} — each occurrence blocks until the user answers.
	const promptPattern = /\{\{prompt:([^}]+)\}\}/gi;
	let match: RegExpExecArray | null;
	while ((match = promptPattern.exec(processed)) !== null) {
		const fullMatch = match[0];
		const promptLabel = match[1] ?? "";
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
