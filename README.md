# Command Palette Manager

Visual command palette manager: add multiple aliases to any plugin command, rename & revert, hide commands, group by action, pin UI buttons, build macros, and launch with Raycast-style fuzzy search.

## This repo (faithful deep split from the live bundle)

- `src/types.ts` — `CpmSettings`, `CommandOverride`, `PinnedButton`, `Macro`, `FuzzyResult`
- `src/settings.ts` — `DEFAULT_SETTINGS` + `DEFAULT_ACTION_GROUPS` must match live `data.json` keys
- `src/fuzzy.ts` — `fuzzyScore` (exact/prefix/word/acronym/subsequence), `renderHighlightedText`, `validateSafeUri`, `debounce`
- `src/registry.ts` — `CommandRegistryService` (snapshot, alias proxies with `checkCallback` forwarding, `executeCommandSafe`, stats) + `MacroEngine` (loop-guarded `command/text/notice/uri` steps)
- `src/buttons.ts` — `ButtonInjector` (ribbon/statusbar/header + `editor-menu/file-menu` context menus, device filter)
- `src/modals.ts` — `TextPromptModal` (`{{prompt:}}`), `ConfirmModal`, `InputModal`, `QuickCommandPaletteModal`, `CommandManagerModal`
- `src/main.ts` — plugin entry (onload/commands/settings lifecycle)

## Parity checklist

- [x] Entry, 2 commands, ribbon, settings tab shell, backup/restore (`backup.json`)
- [ ] `CommandManagerUI` deep tabs (commands/actions/macros/buttons, bulk bar)
- [x] Quick palette shell (input + `fuzzyScore` ranking)
- [ ] `VisualIconPickerModal`, `AssignCommandsToGroupModal` full parity
- [x] `styles.css` — live glassmorphism, copied verbatim (24,889 bytes)
- [x] Data compat: `data.json` (`commandOverrides`, `pinnedButtons`, `macros`, `commandStats`)

## Develop

- `npm i` (Node 18+), `npm run dev`, `npm run build` → `main.js`

Manual install: copy `main.js`, `manifest.json`, `styles.css` to `<Vault>/.obsidian/plugins/command-palette-manager/`.

## License

Code: PolyForm Noncommercial 1.0.0 (see `LICENSE`). Docs: CC BY-NC 4.0. Copyright © Mostakim2005. Source-available: free non-commercial use with credit, no commercial use.
