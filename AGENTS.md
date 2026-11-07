# Project Operating Instructions (`AGENTS.md`)
> **Notice:** This project inherits user persona, confirmation gates, and documentation blueprints from the global master `AGENTS.md`. Do not duplicate those rules here.

## 1. Project Tech Stack & Environment
* **Runtime / Language:** Node.js 18+, TypeScript 5.8 (`strict` + `noUncheckedIndexedAccess`).
* **Framework / Host:** Obsidian plugin API, `minAppVersion` 1.7.0, desktop and mobile (`isDesktopOnly: false`).
* **Build Output:** `main.js` (CommonJS bundle) at the repository root, shipped with `manifest.json` and `styles.css`.
* **Package Manager / Bundler:** npm + esbuild (`esbuild.config.mjs`, entry `src/main.ts`).

## 2. Mandatory Verification & Build Commands
* **Type Check:** `npx tsc -noEmit -skipLibCheck`
* **Lint:** `npm run lint`
* **Build:** `npm run build`
* **Watch / Dev:** `npm run dev`

## 3. Repository Directory Structure & Conventions
* `src/` — modular TypeScript source; one responsibility per file:
  * `main.ts` — plugin lifecycle and public inter-plugin API only.
  * `registry.ts` — command snapshot, overrides, alias proxies, interceptors, usage stats, external import.
  * `macro-engine.ts` — step sequencer; `macro-variables.ts` — token expansion.
  * `buttons.ts` — five UI injection targets.
  * `quick-palette.ts` — Raycast-style launcher.
  * `command-manager-ui.ts` — the four-tab management surface and its modal.
  * `modals.ts` — prompt, confirm, input, icon picker, group assignment.
  * `settings.ts` / `types.ts` — defaults, constants, and shared contracts.
  * `settings-tab.ts` — native Obsidian settings tab.
  * `fuzzy.ts` — scoring, highlighting, URI validation, debounce.
* `docs/` — `PRODUCT.md`, `ARCHITECTURE.md`, `DECISIONS_AND_TRAPS.md`, `VISUAL_GUIDE.html`.
* `runtime/` — frozen plug-and-play bundle (`main.js`, `manifest.json`, `styles.css`) kept as the emergency fallback. Never regenerate into this folder.
* `main.js` at the root is a generated build artifact; edit `src/` instead.

## 4. Repository-Specific Engineering Traps
* **TRAP 1:** `runtime/` is a frozen snapshot and is not byte-identical to the newest live vault bundle. Treat `src/` as the evolution target and `runtime/` as a user-facing fallback only.
* **TRAP 2:** `data.json` key shapes (`commandOverrides`, `pinnedButtons`, `macros`, `commandStats`) are user data. Renaming a key in `DEFAULT_SETTINGS` silently discards existing settings; add a migration instead.
* **TRAP 3:** The plugin mutates undocumented Obsidian internals (`app.commands`, `app.plugins`, `app.internalPlugins`, `app.hotkeyManager`, `app.setting`). Keep those access points cast locally and defensive; never assume they exist on future app versions.
* **TRAP 4:** `styles.css` is copied verbatim from the live runtime and every class name in it is a contract with `createEl({ cls })` calls. Do not rename `cpm-*` classes without updating both sides.
