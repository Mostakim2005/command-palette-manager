// Command Palette Manager — type contracts mirrored from the live Nihon 1.2.0 bundle.

export interface CommandOverride {
	customName: string;
	aliases: string[];
	hidden: boolean;
	pinned: boolean;
	group: string;
}

export interface PinnedButton {
	id: string;
	commandId: string;
	icon: string;
	label: string;
	location: "ribbon" | "statusbar" | "header" | "editor-menu" | "file-menu";
	color: string;
	device: "all" | "desktop" | "mobile";
	displayMode: "icon" | "both" | "text";
	tooltip: string;
}

export type MacroStepType = "command" | "text" | "notice" | "clipboard" | "uri" | "delay";

export interface MacroStep {
	type: MacroStepType;
	commandId: string;
	text: string;
	delayMs: number;
}

export interface Macro {
	id: string;
	name: string;
	desc?: string;
	icon: string;
	aliases: string[];
	loop: number;
	steps: MacroStep[];
}

export interface MacroTemplate {
	name: string;
	desc: string;
	icon: string;
	aliases: string[];
	loop: number;
	steps: MacroStep[];
}

export interface CommandStat {
	runs: number;
	lastRun: number;
}

export interface CpmSettings {
	commandOverrides: Record<string, CommandOverride>;
	actionGroups: string[];
	pinnedButtons: PinnedButton[];
	macros: Macro[];
	recentCommandIds: string[];
	cardStyle: "single" | "double" | "grid";
	bulkBarMode: "contextual" | "always";
	aliasPrefixMode: "source" | "none" | "custom" | "manager";
	customAliasPrefix: string;
	appendAliasesToOriginal: boolean;
	enableQuickPalette: boolean;
	quickPaletteSort: "frequency" | "recent" | "alpha" | "pinned";
	showHotkeys: boolean;
	showPluginBadges: boolean;
	confirmDestructive: boolean;
	autoBackupOnSave: boolean;
	autoGroupInitialized: boolean;
	accentThemeMode: "theme" | "custom";
	customAccentColor: string;
	glassmorphism: boolean;
	commandStats: Record<string, CommandStat>;
}

export interface FuzzyResult {
	match: boolean;
	score: number;
	indices: number[];
}

/** Immutable snapshot of a command as Obsidian registered it. */
export interface CommandSnapshot {
	id: string;
	originalName: string;
	originalIcon: string;
	pluginId: string;
	pluginName: string;
	rawPrefix: string;
}

/** Merged view of snapshot + user override, consumed by every UI surface. */
export interface ManagedCommand {
	id: string;
	originalName: string;
	currentName: string;
	customName: string;
	icon: string;
	pluginId: string;
	pluginName: string;
	aliases: string[];
	hidden: boolean;
	pinned: boolean;
	group: string;
	hotkey: string;
	runs: number;
	lastRun: number;
	isModified: boolean;
}

export interface VisualIcon {
	id: string;
	label: string;
	cat: string;
}

/** Loose shape of the undocumented `app.commands` surface this plugin hooks. */
export interface InternalCommand {
	id: string;
	name?: string;
	icon?: string;
	checkCallback?: (checking: boolean) => boolean | void;
	editorCheckCallback?: (checking: boolean, editor: unknown, ctx: unknown) => boolean | void;
	editorCallback?: (editor: unknown, ctx: unknown) => void;
	callback?: () => void;
}

export interface CommandsApi {
	commands: Record<string, InternalCommand>;
	addCommand?: (cmd: InternalCommand) => void;
	removeCommand?: (id: string) => void;
	executeCommandById?: (id: string) => boolean;
	findCommand?: (id: string) => InternalCommand | null | undefined;
	listCommands?: () => InternalCommand[];
}
