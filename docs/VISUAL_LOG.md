# Visual Feature & Change Log (`VISUAL_LOG.md`)
> **1-Line Summary:** Plain-English, color-coded Obsidian-compatible Mermaid flowcharts explaining how each major flow in Command Palette Manager operates end to end.

## Feature & Change Flowcharts

### [VISUAL: Raycast-Palette-Launcher-Flow] | Aliases: quick launcher, fuzzy search, raycast palette
> **1-Line Summary:** How the Raycast-style launcher searches, ranks, and triggers commands, aliases, macros, and assigned hotkeys.

* **Plain-English Walkthrough:** When the user presses the launcher hotkey, `QuickPalette` displays an overlay search prompt. As characters are typed, the input is scored using fuzzy matching against registered commands, custom aliases, and macros. Hidden commands are filtered out unless explicitly requested. Selecting a result directly executes the target or steps through a macro sequence while recording execution counts.

```mermaid
flowchart TD
    %% Color Definitions (Obsidian & GitHub compatible)
    classDef startNode fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff
    classDef processNode fill:#0f766e,stroke:#115e59,color:#ffffff
    classDef outputNode fill:#15803d,stroke:#14532d,color:#ffffff
    classDef trapNode fill:#b91c1c,stroke:#7f1d1d,color:#ffffff

    Start([User opens QuickPalette via Hotkey / Ribbon]):::startNode --> Snapshot[Snapshot app.commands & Overrides]:::processNode
    Snapshot --> UserInput[/User types query in search input/]:::processNode

    UserInput --> FuzzyScore[Fuzzy match against names, aliases, and tags]:::processNode
    FuzzyScore --> HiddenFilter{Is command marked hidden?}:::processNode

    HiddenFilter -->|Yes| DropItem[Filter out from results]:::processNode
    HiddenFilter -->|No| RankItem[Sort by score and recent usage stats]:::processNode
    DropItem --> RenderList[Render top matching items in Palette UI]:::processNode
    RankItem --> RenderList

    RenderList --> Selection[/User selects command or macro/]:::processNode
    Selection --> TypeCheck{Is selected item a Macro?}:::processNode

    TypeCheck -->|Yes| RunMacro[Delegate to MacroEngine.runMacro]:::processNode
    TypeCheck -->|No| ExecCmd[app.commands.executeCommandById]:::processNode

    RunMacro --> TrackStats[Increment commandStats usage count]:::processNode
    ExecCmd --> TrackStats
    TrackStats --> Done([Command Executed & Palette Closed]):::outputNode

    subgraph Legend["Legend (Color Guide)"]
        L1([Blue = Starting User Action / Entry Point]):::startNode
        L2[Teal = Processing & Transformation Step]:::processNode
        L3([Green = Successful Final Outcome]):::outputNode
        L4[Red = Filtering / Guard Gate]:::trapNode
    end
```

* **Code Anchors (Grep Targets):**
  * `src/quick-palette.ts` -> `QuickPalette.open`, `getItems`, `onChooseItem`
  * `src/fuzzy.ts` -> `fuzzyScore`, `highlightMatches`
  * `src/registry.ts` -> `recordCommandUsage`

---

### [VISUAL: Alias-And-Override-Interceptor-Flow] | Aliases: command interceptor, custom alias, proxy registration
> **1-Line Summary:** How user overrides and aliases wrap native commands dynamically without deleting host command structures.

* **Plain-English Walkthrough:** Instead of mutating Obsidian's core command definitions (which could break hotkeys and cause exceptions), the plugin uses non-destructive alias proxies and wrapper interceptors. Renamed labels, custom icons, and proxy slugs are registered dynamically on startup and hot-reloaded cleanly upon settings changes.

```mermaid
flowchart TD
    %% Color Definitions (Obsidian & GitHub compatible)
    classDef startNode fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff
    classDef processNode fill:#0f766e,stroke:#115e59,color:#ffffff
    classDef outputNode fill:#15803d,stroke:#14532d,color:#ffffff
    classDef trapNode fill:#b91c1c,stroke:#7f1d1d,color:#ffffff

    Start([Plugin Initialization / Settings Change]):::startNode --> LoadOverrides[Read commandOverrides from data.json]:::processNode
    LoadOverrides --> Iterate[Iterate Registered Commands in app.commands]:::processNode

    Iterate --> CollisionCheck{Alias ID collides with existing command?}:::processNode
    CollisionCheck -->|Yes| SlugTrap[Sanitize slug suffix to prevent silent collision]:::trapNode
    CollisionCheck -->|No| RegisterProxy[Register proxy command via addCommand]:::processNode
    SlugTrap --> RegisterProxy

    RegisterProxy --> HostCallback{Has checkCallback / editorCallback?}:::processNode
    HostCallback -->|Yes| WrapContext[Forward active editor/view context to target]:::processNode
    HostCallback -->|No| WrapDirect[Wrap simple callback execution]:::processNode

    WrapContext --> Complete([Proxies & Overrides Active]):::outputNode
    WrapDirect --> Complete

    subgraph Legend["Legend (Color Guide)"]
        L1([Blue = Starting Event / Entry Point]):::startNode
        L2[Teal = Processing & Transformation Step]:::processNode
        L3([Green = Successful Final Outcome]):::outputNode
        L4[Red = Slug Conflict Protection]:::trapNode
    end
```

* **Code Anchors (Grep Targets):**
  * `src/registry.ts` -> `registerAliasProxies`, `applyOverride`
  * `src/main.ts` -> `onload`, `saveSettings`
