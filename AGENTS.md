# Project Operating Instructions (`AGENTS.md`)
> **Notice:** This project inherits user persona, confirmation gates, visual standards, and documentation blueprints from the global master `AGENTS.md`. Do not duplicate those rules here.

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
* `src/` â€” modular TypeScript source; one responsibility per file:
  * `main.ts` â€” plugin lifecycle and public inter-plugin API only.
  * `registry.ts` â€” command snapshot, overrides, alias proxies, interceptors, usage stats, external import.
  * `macro-engine.ts` â€” step sequencer; `macro-variables.ts` â€” token expansion.
  * `buttons.ts` â€” five UI injection targets.
  * `quick-palette.ts` â€” Raycast-style launcher.
  * `command-manager-ui.ts` â€” the four-tab management surface and its modal.
  * `modals.ts` â€” prompt, confirm, input, icon picker, group assignment.
  * `settings.ts` / `types.ts` â€” defaults, constants, and shared contracts.
  * `settings-tab.ts` â€” native Obsidian settings tab.
  * `fuzzy.ts` â€” scoring, highlighting, URI validation, debounce.
* `docs/` â€” Core Markdown documentation suite (`PRODUCT.md`, `ARCHITECTURE.md`, `DECISIONS_AND_TRAPS.md`, `VISUAL_LOG.md`).
* `preview/` â€” On-demand interactive HTML/CSS/JS visual previews (e.g., `preview/visual-guide.html`), created only upon explicit request.
* `main.js` at the root is a generated build artifact; edit `src/` instead.

## 4. Critical Trap Pointers (1-Line Warnings Only)
* **TRAP 1:** Never permanently delete commands from host table; use interceptors instead â€” see `docs/DECISIONS_AND_TRAPS.md` -> `[TRAP: Never-Permanently-Delete-Commands]`.
* **TRAP 2:** Avoid busy-wait loops in macro delays; use non-blocking timers â€” see `docs/DECISIONS_AND_TRAPS.md` -> `[TRAP: Macro-Delay-Busy-Wait]`.
* **TRAP 3:** Check for alias slug collisions before registering command proxies â€” see `docs/DECISIONS_AND_TRAPS.md` -> `[TRAP: Alias-Slug-Collisions]`.
* **TRAP 4:** Recreate header action buttons safely on leaf focus without DOM churn â€” see `docs/DECISIONS_AND_TRAPS.md` -> `[TRAP: Header-DOM-Recreated-On-Leaf-Focus]`.
* **TRAP 5:** Preserve persisted `data.json` key shapes with migration rather than renaming defaults â€” see `docs/DECISIONS_AND_TRAPS.md` -> `[TRAP: Settings-Key-Compatibility]`.
