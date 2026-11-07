# Command Palette Manager

> [!NOTE]
> **Live Plug-and-Play Runtime Available:** The `runtime/` directory contains the production-tested JavaScript bundle (`main.js`, `manifest.json`, `styles.css`) that runs in the live Obsidian vault. Copy those three files into `<Vault>/.obsidian/plugins/command-palette-manager/` for immediate use. The TypeScript source in `src/` is now a full behavioral port of that bundle.

Visual command palette manager: add multiple aliases to any plugin command, rename & revert, hide commands, group by action, pin UI buttons, build macros, and launch with Raycast-style fuzzy search.

## Documentation

| File | What it answers |
| --- | --- |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | What the plugin must do, feature by feature, with code anchors. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Mermaid system map, subsystem mechanics, verification commands, extension recipes. |
| [`docs/DECISIONS_AND_TRAPS.md`](docs/DECISIONS_AND_TRAPS.md) | Why each non-obvious mechanism exists and what must never be changed. |
| [`docs/VISUAL_GUIDE.html`](docs/VISUAL_GUIDE.html) | Self-contained browser dashboard of intent, architecture, decisions and landmines. |
| [`AGENTS.md`](AGENTS.md) | Repository-specific build commands, layout and traps. |

## Source layout

- `src/types.ts` — `CpmSettings`, `CommandOverride`, `PinnedButton`, `Macro`, `MacroStep`, `ManagedCommand`, `CommandsApi`
- `src/settings.ts` — `DEFAULT_SETTINGS`, `DEFAULT_ACTION_GROUPS`, `DEFAULT_STARTER_BUTTONS`, `MACRO_TEMPLATES`, `VISUAL_ICONS`
- `src/fuzzy.ts` — `fuzzyScore` (exact/prefix/word/acronym/subsequence), `renderHighlightedText`, `validateSafeUri`, `debounce`
- `src/registry.ts` — `CommandRegistryService` (snapshot, rename, hide via `hiddenBackup`, alias proxies with `checkCallback` forwarding, interceptors, stats, CMDR/BCP import) + macro command registration
- `src/macro-engine.ts` + `src/macro-variables.ts` — `MacroEngine.runMacro` (6 step types, loop guard, awaited delays) and `expandMacroVariables` (`{{date}}`, `{{title}}`, `{{prompt:…}}`, …)
- `src/buttons.ts` — `ButtonInjector` (header / ribbon / statusbar / editor-menu / file-menu, device filter, safe teardown)
- `src/quick-palette.ts` — `QuickCommandPaletteModal` (`@group`, `#plugin`, `!macro`, `*pinned`, keyboard nav, starring, usage sort)
- `src/command-manager-ui.ts` — `CommandManagerUI` (Commands, Groups, UI Buttons, Macros tabs; bulk bar; grouped sections; infinite scroll; card styles) + `CommandManagerModal`
- `src/modals.ts` — `TextPromptModal`, `ConfirmModal`, `InputModal`, `VisualIconPickerModal`, `AssignCommandsToGroupModal`
- `src/settings-tab.ts` — native settings tab
- `src/main.ts` — plugin entry, lifecycle, public API

## Parity checklist

- [x] Entry, 2 commands, ribbon, settings tab, backup/restore (`backup.json`)
- [x] `CommandManagerUI` deep tabs (commands / groups / buttons / macros, bulk bar, grouping, card styles)
- [x] Quick palette (prefix operators, full keyboard navigation, starring, usage/recent sorting)
- [x] `VisualIconPickerModal`, `AssignCommandsToGroupModal`, prompt/confirm/input modals
- [x] Registry: snapshot, rename, append-alias, hide via interceptors, alias proxies, macro commands, orphan cleanup, CMDR/BCP import
- [x] Macro engine: `command` / `text` / `notice` / `clipboard` / `uri` / `delay`, variables, interactive `{{prompt:…}}`, loop guard
- [x] `ButtonInjector`: five targets, device filter, display mode, reorder, test, teardown
- [x] `styles.css` — live glassmorphism, copied verbatim
- [x] Data compatibility: `data.json` keys (`commandOverrides`, `pinnedButtons`, `macros`, `commandStats`)

## Develop

```bash
npm install
npm run dev     # esbuild watch
npm run build   # tsc --noEmit + production bundle → main.js
npm run lint
```

Manual install: copy `main.js`, `manifest.json`, `styles.css` to `<Vault>/.obsidian/plugins/command-palette-manager/`.

## License

Code: PolyForm Noncommercial 1.0.0 (see `LICENSE`). Docs: CC BY-NC 4.0. Copyright © Mostakim2005. Source-available: free non-commercial use with credit, no commercial use.
