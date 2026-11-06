// Command Palette Manager — faithful types from live Nihon 1.2.0 bundle (4035 lines)
export interface CommandOverride {
  customName: string;
  aliases: string[];
  hidden: boolean;
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

export interface MacroStep {
  type: "command" | "text" | "notice" | "clipboard" | "uri" | "delay";
  commandId: string;
  text: string;
  delayMs: number;
}

export interface Macro {
  id: string;
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
