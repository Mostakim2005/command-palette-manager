# Command Palette Manager

Visual command palette manager: add multiple aliases to any plugin command, rename & revert, hide commands, group by action, pin UI buttons, build macros, and launch with Raycast-style fuzzy search.

` v1.2.0 (read-only â€” not modified).

## This repo (TS scaffold from Mostakim2005 template)

- `src/types.ts` â€” typed settings surface from the live bundle
- `src/settings.ts` â€” `DEFAULT_SETTINGS` + `DEFAULT_ACTION_GROUPS` must match live `data.json` keys
- `src/main.ts` â€” typed plugin entry (onload/commands/settings lifecycle) ported from the bundle

## Parity checklist (next split steps)

- [ ] `CommandRegistryService` (scan/sync, alias sync, hide, groups)
- [ ] `MacroEngine` (runMacro, steps/delays)
- [ ] `ButtonInjector` (header buttons, context menus)
- [ ] `CommandManagerModal` / `QuickCommandPaletteModal` (fuzzyScore Raycast-style)
- [ ] `CommandManagerSettingTab` (full settings UI)
- [ ] `styles.css` â€” live Nihon hybrid glassmorphism, copied verbatim (24,889 bytes)
- [ ] Data compat: `data.json` (`commandOverrides`, `pinnedButtons`, `macros`, `commandStats`)

## Develop

- `npm i` (Node 18+)
- `npm run dev` â€” watch
- `npm run build` â€” `main.js` at repo root

Manual install: copy `main.js`, `manifest.json`, `styles.css` to `<Vault>/.obsidian/plugins/command-palette-manager/`.

## License

Code: PolyForm Noncommercial 1.0.0 (see `LICENSE`). Docs: CC BY-NC 4.0. Copyright Â© Mostakim2005 / Mostakim2005. Source-available, not OSI open-source: free non-commercial use with credit, no commercial use.

