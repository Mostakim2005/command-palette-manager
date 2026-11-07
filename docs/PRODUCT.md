# Product Intent & Feature Map (`PRODUCT.md`)
> **1-Line Summary:** The permanent source of truth for what Command Palette Manager does for the user, independent of how the code is implemented.

## 1. Core Vision & User Experience Intent
* **What This App Does (Plain English):** Turns Obsidian's flat command list into a manageable workspace: rename any command, give it several short aliases, hide the clutter, group it by task, pin it to the UI, and chain it into macros.
* **How It Must Feel to Use:** Instant. The quick palette opens and filters without perceptible lag, respects the active theme (light, dark, custom accents), and never breaks native hotkeys or third-party plugin calls. Every destructive action is reversible, and every change is persisted immediately.

## 2. Active Features (Do Not Break)

### [FEATURE: Non-Destructive-Command-Snapshot] | Aliases: revert, restore defaults, original name, factory reset
> **1-Line Summary:** Records every command's factory name and icon once, so any rename or hide can be undone in a single click.
* **User Intention (Non-Negotiable):** Reverting must return the exact original name and visibility without a vault restart, and must survive plugin reloads.
* **Visual / UI Behavior:** The Revert button on each command card and the bulk Revert action in the bulk bar; disabled when a command has no modifications.
* **Code Anchors (Grep Targets):**
  * `src/registry.ts` -> `CommandRegistryService.originalSnapshot`, `CommandRegistryService.revertCommand`
  * `src/registry.ts` -> `CommandRegistryService.scanAndSyncAll`

### [FEATURE: Multi-Alias-Engine] | Aliases: alias, shortcut word, trigger keyword, slash menu
> **1-Line Summary:** Registers extra search words for any command as real Obsidian commands, with four selectable prefix styles.
* **User Intention (Non-Negotiable):** An alias must work from the native Command Palette, the `/` slash menu, and any launcher, and editor-only commands must not appear when no editor is open.
* **Visual / UI Behavior:** Alias pills plus an inline `+ alias...` field on every command card; comma-separated input creates several aliases at once.
* **Code Anchors (Grep Targets):**
  * `src/registry.ts` -> `CommandRegistryService.registerAliasProxyCommand`, `syncAliases`, `formatAliasDisplayName`
  * `src/settings.ts` -> `DEFAULT_SETTINGS.aliasPrefixMode`

### [FEATURE: Safe-Command-Hiding] | Aliases: hide command, declutter, declutter palette, invisible command
> **1-Line Summary:** Removes commands from palettes while keeping hotkeys and programmatic execution working.
* **User Intention (Non-Negotiable):** Hiding is a view concern, never a deletion. A hidden command must still run from its hotkey, a macro, a pinned button, or another plugin.
* **Visual / UI Behavior:** Eye toggle per command, Hidden state filter, bulk Hide/Show actions, dimmed card styling for hidden commands.
* **Code Anchors (Grep Targets):**
  * `src/registry.ts` -> `CommandRegistryService.installCommandInterceptors`, `hiddenBackup`, `executeCommandSafe`

### [FEATURE: Raycast-Fuzzy-Quick-Palette] | Aliases: quick palette, launcher, fuzzy search, command popup
> **1-Line Summary:** A scored fuzzy launcher with match highlighting, keyboard navigation, starring, and prefix filters.
* **User Intention (Non-Negotiable):** Typing two or three letters must surface the intended command; `@group`, `#plugin`, `!macro`, and `*pinned` must narrow results predictably.
* **Visual / UI Behavior:** Modal opened by command or hotkey; search row, sort selector, group chips, result rows with alias pills, hotkey badges, usage counts, and a footer of key hints.
* **Code Anchors (Grep Targets):**
  * `src/quick-palette.ts` -> `QuickCommandPaletteModal.renderResults`, `updateHighlight`
  * `src/fuzzy.ts` -> `fuzzyScore`, `renderHighlightedText`

### [FEATURE: Command-Usage-Analytics] | Aliases: statistics, most used, recent commands, frequency sort
> **1-Line Summary:** Counts executions and remembers recent commands to rank the quick palette by real usage.
* **User Intention (Non-Negotiable):** Ranking must reflect what the user actually runs, and the write cost must not thrash the disk.
* **Visual / UI Behavior:** "N runs" pills on cards and `Nx` badges in the palette; sort options Most Used, Recent, Starred First, A–Z.
* **Code Anchors (Grep Targets):**
  * `src/registry.ts` -> `CommandRegistryService.recordCommandUsage`, `getHotkeyForCommand`
  * `src/settings.ts` -> `DEFAULT_SETTINGS.quickPaletteSort`

### [FEATURE: Macro-Sequencer] | Aliases: macro, workflow, chain commands, automation, template
> **1-Line Summary:** Chains commands, inserted text, notices, clipboard writes, and URIs with per-step delays and variable expansion.
* **User Intention (Non-Negotiable):** Macros must never freeze Obsidian (delays are awaited), must refuse recursive self-runs, and must block unsafe URI schemes.
* **Visual / UI Behavior:** Macros tab with starter templates, macro chips, name/alias/loop controls, a step builder, quick variable tags, and reorderable step cards.
* **Code Anchors (Grep Targets):**
  * `src/macro-engine.ts` -> `MacroEngine.runMacro`
  * `src/macro-variables.ts` -> `expandMacroVariables`
  * `src/settings.ts` -> `MACRO_TEMPLATES`

### [FEATURE: UI-Button-Injector] | Aliases: pin button, header button, ribbon icon, status bar, context menu
> **1-Line Summary:** Pins any command or macro into five UI locations with icon, label, color, and device targeting.
* **User Intention (Non-Negotiable):** Buttons must keep the user's order, must not duplicate on leaf focus, and must clean themselves up on unload.
* **Visual / UI Behavior:** UI Buttons tab with add bar, icon picker, color picker, label field, location/mode/device selectors, reorder arrows, and Test/Remove actions.
* **Code Anchors (Grep Targets):**
  * `src/buttons.ts` -> `ButtonInjector.syncButtons`, `injectHeaderButtons`, `clearInjectedButtons`
  * `src/modals.ts` -> `VisualIconPickerModal`

### [FEATURE: Action-Groups] | Aliases: group, category, tag, organize commands
> **1-Line Summary:** Organizes commands into named groups that drive chips, filters, and the quick palette's `@group` operator.
* **User Intention (Non-Negotiable):** Renaming or deleting a group must update every command assigned to it, never orphan them silently.
* **Visual / UI Behavior:** Groups tab with inline rename, command counts, Assign Commands modal, Filter View, and Delete; group chips at the top of the Commands tab.
* **Code Anchors (Grep Targets):**
  * `src/command-manager-ui.ts` -> `CommandManagerUI.renderGroupsTab`
  * `src/registry.ts` -> `CommandRegistryService.autoGroupCommands`, `inferSmartGroup`

### [FEATURE: Backup-And-Restore] | Aliases: snapshot, backup.json, import export settings, rollback
> **1-Line Summary:** Writes a JSON snapshot of all settings beside the plugin and can restore or import/export it.
* **User Intention (Non-Negotiable):** Restoring must be explicit, confirmed, and must re-apply command state immediately.
* **Visual / UI Behavior:** Options & Tools menu entries for Save Snapshot, Restore, Export to Clipboard, and Import from Clipboard.
* **Code Anchors (Grep Targets):**
  * `src/main.ts` -> `CommandPaletteManagerPlugin.saveBackupSnapshot`, `restoreFromBackupSnapshot`
  * `src/command-manager-ui.ts` -> `CommandManagerUI.showToolsMenu`

### [FEATURE: Theme-Adaptive-Glassmorphism] | Aliases: appearance, accent color, dark mode, frosted glass
> **1-Line Summary:** Adapts to the active Obsidian theme with optional custom accent and frosted-glass panels.
* **User Intention (Non-Negotiable):** Contrast must stay readable in light and dark themes; nothing may hardcode a single color that clashes.
* **Visual / UI Behavior:** Settings toggles for accent mode, accent color, and glassmorphism; `cpm-glassmorphic` class on the document body.
* **Code Anchors (Grep Targets):**
  * `src/main.ts` -> `CommandPaletteManagerPlugin.applyThemePreferences`
  * `styles.css` -> `.cpm-glassmorphic`
  * `src/command-manager-ui.ts` -> `CommandManagerUI.render`

### [FEATURE: External-Config-Import] | Aliases: CMDR, Commander, Better Command Palette, migrate
> **1-Line Summary:** Pulls hidden commands, macros, and pinned buttons from Commander and Better Command Palette.
* **User Intention (Non-Negotiable):** Import must be additive and de-duplicated; it must never overwrite existing pins for the same command and location.
* **Visual / UI Behavior:** Single menu action; reports how many items were imported.
* **Code Anchors (Grep Targets):**
  * `src/registry.ts` -> `CommandRegistryService.importExternalConfigs`

### [FEATURE: Inter-Plugin-Public-API] | Aliases: API, integration, another plugin, run macro
> **1-Line Summary:** Lets other plugins open the manager, launch the palette, run commands and macros, and add aliases.
* **User Intention (Non-Negotiable):** These methods must stay stable because other plugins call them by ID.
* **Visual / UI Behavior:** No UI of its own; consumed via `app.plugins.plugins["command-palette-manager"]`.
* **Code Anchors (Grep Targets):**
  * `src/main.ts` -> `openManager`, `openQuickPalette`, `executeCommand`, `runMacro`, `addCommandAlias`, `getAllCommands`

## 3. Planned Features & App-Merge Wishlist

### [WISHLIST: Macro-Conditional-Steps] | Aliases: if else, conditional macro, branching
> **1-Line Summary:** Add optional conditions so a macro step runs only when a note, editor, or selection matches.
* **User Intention:** Let one macro behave differently in reading view versus editing view without duplicating it.
* **Target Integration Point:** `src/macro-engine.ts` -> `MacroEngine.runMacro` step dispatch.

### [WISHLIST: Alias-Conflict-Report] | Aliases: duplicate alias, collision, slug warning
> **1-Line Summary:** Surface a warning when two commands claim aliases that collapse to the same command ID slug.
* **User Intention:** Avoid a silent "last one wins" surprise when aliases differ only by punctuation.
* **Target Integration Point:** `src/registry.ts` -> `CommandRegistryService.syncAliases`.

### [WISHLIST: Per-Command-Shortcut-Binding] | Aliases: hotkey, keybinding, assign shortcut
> **1-Line Summary:** Assign a hotkey directly from the command card instead of jumping to Obsidian's hotkey settings.
* **User Intention:** Keep the user in one screen while configuring a command end to end.
* **Target Integration Point:** `src/registry.ts` -> `CommandRegistryService.openHotkeySettingsFor`.
