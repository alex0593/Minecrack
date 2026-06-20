# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Minecrack** is a custom Minecraft launcher built with **Tauri 2.0 (Rust backend) + React 19 (TypeScript/JSX frontend)**. Design goals: offline-only gameplay (no Microsoft auth), multi-instance management, and support for multiple mod loaders (Vanilla, Fabric, Forge, Quilt, NeoForge).

## Commands

```bash
npm run dev        # Start Vite dev server (port 1420) + Tauri dev window
npm run build      # Production build (Vite + Tauri native bundle)
npm run tauri      # Direct tauri CLI access
npm run test       # Run Vitest test suite (jsdom environment)
npm run test:watch # Vitest in watch mode
```

Run a single test file:
```bash
npx vitest run src/test/instances.test.js
```

Rust-only iteration (from `src-tauri/`):
```bash
cargo build   # Compile Rust backend
cargo test    # Run Rust unit tests
cargo check   # Fast type-check without full compilation
```

## Architecture

### Frontend ↔ Backend IPC

All communication goes through `src/lib/tauri.js`, which wraps Tauri's `invoke` (commands) and `listen` (events). In browser dev mode without Tauri, this file returns mock responses so the UI works standalone.

```
React → tauriCmd('command_name', args) → Rust #[tauri::command] fn
Rust  → window.emit("event://name", payload) → tauriListen('event://name', handler) → React
```

**Important**: `tauriCmd` silently falls back to mock responses on failure — failed commands do not throw in browser dev mode. Always test in Tauri (not browser) when debugging backend integration.

Typed wrappers in `tauri.js` (prefer these over raw `tauriCmd`): `getLauncherDir`, `downloadFile`, `launchGame`, `detectJava`, `listMods`, `downloadMod`, `verifyInstance`, `removeDir`, `copyDir`, etc.

### Rust Commands (registered in `src-tauri/src/lib.rs`)

File system: `get_launcher_dir`, `ensure_dir`, `create_dir_all`, `remove_dir`, `copy_dir`, `write_file`, `read_file`, `delete_file`, `write_file_base64`, `read_file_base64`, `copy_file`, `file_exists`, `extract_zip`

Download & launch: `download_file`, `download_mod`, `download_resourcepack`, `download_shaderpack`, `prepare_game_launch`, `launch_game`

Java: `detect_java`, `validate_java`, `install_java_runtime`

Mods: `list_mods`, `delete_mod`, `toggle_mod`, `export_instance_mods`, `import_instance_mods`, `inspect_mods_zip`

Resource/Shaderpacks: `list_resourcepacks`, `add_resourcepack`, `delete_resourcepack`, `list_shaderpacks`, `add_shaderpack`, `delete_shaderpack`

Instance management: `verify_instance`, `get_repair_tasks`, `inspect_instance_folder`, `inspect_instance_zip`, `get_mods_to_download`, `import_instance_from_folder`, `import_instance_from_zip`

### Data Directory

- Windows: `%APPDATA%\minecrack`
- Linux/macOS: `~/.local/share/minecrack`

Layout: `instances/{uuid}/`, `versions/{version}/`, `libraries/`, `assets/`, `runtimes/`

### State Management

`src/store.jsx` — single React Context + `useReducer`. Split into `StateContext` (reads) and `DispatchContext` (writes) to prevent unnecessary re-renders. All global state: `instances[]`, `selectedInstanceId`, `instanceMods[]`, `instanceResourcePacks[]`, `instanceShaderpacks[]`, `profile{}`, `modal`, `download{}`, `gameRunning`, `gameLogs[]`, `config{}`. Access via `useStore()` (both), `useStoreState()` (read-only), or `useDispatch()` (dispatch-only). No side effects in the reducer.

`SELECT_INSTANCE` clears `instanceMods`, `instanceResourcePacks`, and `instanceShaderpacks` to avoid stale data when switching instances.

### Custom Hooks

- `src/hooks/useGameLauncher.js` — triggers launch on `SET_GAME_RUNNING`, reads version JSON, calls `launchGameInstance()` from `launcher.js`, listens for `java://progress` events to surface Java download UI
- `src/hooks/useInstancePersistence.js` — reads/writes `instances.json` to disk, syncs store on startup

### Download System (Two-Phase)

1. **Libraries phase** (`src/lib/instances.js` → `installVersion`): fetches Mojang version manifest, builds a download list (client.jar + native libs), runs them through a concurrency-limited queue in `src/lib/downloader.js` (default 4 parallel, configurable via `VITE_MAX_CONCURRENT_DOWNLOADS`).
2. **Assets phase** (`src/lib/mojang.js` → `installAssets`): ~3000 small texture/sound files downloaded separately and cached by SHA1 hash.

The Rust `download_file` command streams downloads, verifies SHA1 during transfer, retries up to 5 times with 3s/6s/9s/12s backoff, and emits `download://progress` events to the UI. Auto-decompression is disabled (`no_gzip`) to prevent double-decompression of ZIP/JAR files.

### Game Launch Flow

1. `useGameLauncher` detects/validates Java (`detect_java` → `validate_java`)
2. `applySkinToInstance()` in `src/lib/skin.js` — downloads CustomSkinLoader mod if needed, writes skin PNG (best-effort, doesn't block launch)
3. `prepare_game_launch` Rust command builds the full `LaunchConfig` (classpath from version JSON libraries + client JAR, JVM args, game args with offline tokens)
4. `launch_game` spawns the Java process, pipes stdout/stderr to `game://log` events, emits `game://stopped` when done

Client JAR lookup order: `libraries/net/minecraft/client/{v}/client-{v}.jar` (Prism convention) → `versions/{v}/{v}.jar` (vanilla fallback).

### Loader System (`src/lib/loaders/`)

- `index.js` — entry point; dispatches to the correct loader module
- `versions.js` — fetches available loader versions for each mod loader
- `fabric.js`, `quilt.js` — fetch loader metadata from their respective Meta APIs
- `forge.js`, `neoforge.js` — fetch from Prism Meta with retry logic; handle ForgeWrapper detection
- `maven-utils.js` — `nameToMavenPath()` converts Maven coordinates to file paths (handles both 3-part and 4-part with classifiers)

### Mod System (`src/lib/mods/`)

- `metadata.js` — reads mod metadata from JAR manifests (fabric.mod.json, META-INF/mods.toml, quilt.mod.json)
- `validator.js` — validates mod compatibility (loader, MC version)
- `resolver.js` — resolves mod dependencies
- `curseforge-downloader.js` — downloads CurseForge mods in parallel (max 4 concurrent). `resolveDownloadUrl` tries the CF API first; if the API returns no direct URL it falls back to `https://mediafilez.forgecdn.net/files/{id/1000}/{id%1000}/{filename}`. Failed tasks are retried up to 3× with a fresh URL resolution. Progress is reported per-mod via an `(info)` callback: `{ done, total, label, percent, status }`.

### Repair System

- `src/lib/verify.js` — JS-side verification logic
- `src/lib/java-repair.js` — detects and fixes Java installation issues
- `src/lib/minecraft-jar-repair.js` — re-downloads corrupted client JARs
- `src/lib/loader-repair.js` — repairs broken loader profiles; `ensureLoaderProfileUpToDate()` auto-fixes legacy profiles lacking `formatVersion 2`

### Configuration

`src/config.js` — all API endpoints and defaults sourced from `.env` via Vite's `import.meta.env`. Copy `.env.example` to `.env` to configure. CurseForge requires a free API key; all other APIs are unauthenticated.

### Modpack Installation

Two entry points, same underlying flow:

- **`ModpackImportWizard.jsx`** — 4-step wizard (search → preview → config → install). Step 1 includes a MC version filter (`mcVersion` state) passed to both Modrinth and CurseForge search. CurseForge branch: downloads ZIP, extracts to `temp-modpack-{ts}/`, reads `manifest.json`, creates instance, downloads mods via `downloadMultipleModsFromCurseForge`, marks `installed: true`, cleans temp dir in `finally`. Modrinth branch: downloads `.mrpack`, extracts, reads `modrinth.index.json`, downloads files sequentially with per-file progress.
- **`ModpackInstallModal.jsx`** — single-click install from the browser modal. Uses `importInstanceFromFolder` (Rust) which copies `overrides/` and writes `installed: true` to `instances.json`. Then downloads mods via `downloadMultipleModsFromCurseForge`, marks `installed: true` in the store, cleans temp dir in `finally`.

Both clean up `temp-modpack-*` directories via `removeDir` in a `try/finally` block.

The `installed` flag on an instance controls the play button: `false` → opens `DownloadOverlay` (downloads MC version + libraries); `true` → goes straight to game launcher.

### UI Structure

- `App.jsx` — root layout + modal dispatch; `DownloadOverlay` handles MC version + libraries download and sets `installed: true` when done
- `Sidebar.jsx` — profile card, nav tabs, instance list
- `MainPanel.jsx` — instance detail (hero + Mods/Recursos/Shaders/Stats/Console tabs) or welcome screen; `PacksTab` reads `instanceResourcePacks`/`instanceShaderpacks` from store and dispatches after each load, so browser-modal installs update the list immediately
- `ResourcePackBrowserModal.jsx` / `ShaderPackBrowserModal.jsx` — both share `PackBrowserModal.css`. Version resolution uses a two-attempt pattern: first tries the instance's MC version; if no results, falls back to latest with no version filter. CurseForge installs also fall back to the CDN URL (`mediafilez.forgecdn.net`) when `downloadUrl` is absent, matching the same CDN fallback used by `curseforge-downloader.js`.
- `TitleBar.jsx` — custom window controls (Tauri native decorations are disabled)
- CSS uses `--color-*` variables defined in `index.css`; dark gaming theme with emerald accents

## Critical Implementation Details

### Maven Classifier Handling

Library names from Prism Meta can be 3-part or 4-part:
- `group:artifact:version` → `group/artifact/version/artifact-version.jar`
- `group:artifact:version:classifier` → `group/artifact/version/artifact-version-classifier.jar`

`nameToMavenPath()` in `src/lib/loaders/maven-utils.js` handles both. The Forge installer uses 4-part: `net.minecraftforge:forge:1.19.2-43.2.14:installer`.

### ForgeWrapper Launch Sequence

1. Profile loaded from `versions/{loaderVersion}/{loaderVersion}.json`
2. If `mainClass` contains "forgewrapper", the instance is ForgeWrapper-based
3. `-Dforgewrapper.installer=/absolute/path/forge-VERSION-installer.jar` is added to JVM args
4. The Rust `launch_game` command converts forward slashes to backslashes in `-D` JVM args on Windows
5. ForgeWrapper executes the installer, extracts Forge libraries, then loads real Forge mainClass

### Skin Application

`src/lib/skin.js` — `applySkinToInstance()` runs after Java detection, before game launch. Best-effort: failures log a warning but don't block launch. Only applies to modded instances (Fabric/Forge/Quilt/NeoForge).

Profile skin fields (set by `ProfileModal` via `SET_PROFILE`):
- `skinSource: 'crafatar' | 'upload' | 'none'`
- `skinUUID` — online Minecraft UUID (present when `skinSource === 'crafatar'`)
- `skinBase64` — data URL PNG (present when `skinSource === 'upload'`)

Two paths in `applySkinToInstance`:
- **crafatar**: Calls Mojang Session Server (`sessionserver.mojang.com/session/minecraft/profile/{uuid}`) to resolve the actual skin texture URL, downloads to `CustomSkinLoader/LocalSkin/skins/{username}.png`. A marker file `.skin-{skinUUID}` prevents re-downloading on subsequent launches.
- **upload**: Writes `skinBase64` directly to the same path as a PNG.

Both paths then write `CustomSkinLoader.json` config pointing to `LocalSkin` and call `ensureCustomSkinLoader()` to install the CSL mod if not already present.

`ProfileModal.jsx` uses `SkinFacePreview` — a canvas component that draws the 8×8 face region of the skin texture scaled up (pixel-perfect) instead of showing the raw flat texture.

### Mod Toggle Mechanism

Mods are toggled by file extension rename: `.jar` ↔ `.jar.disabled`. The `toggle_mod` Rust command performs the rename; `list_mods` filters by these extensions and sets `enabled` accordingly.

### Version Resolution with Retry

`fetchPrism()` in `src/lib/prism.js` retries 3 times on 5xx/transient errors (1s/2s/4s backoff). 4xx errors fail immediately. `KNOWN_FORGE_VERSIONS` and `KNOWN_NEOFORGE_VERSIONS` tables serve as last-resort fallback when Prism Meta and direct API both fail.

## Key External APIs

| API | Auth | Used For |
|---|---|---|
| Mojang Version Manifest | None | Game versions, libraries, assets |
| Prism Meta | None | Loader metadata (libraries, mavenFiles, mainClass) |
| Fabric/Quilt Meta | None | Loader versions |
| Forge Maven | None | Forge installer, universal JAR |
| Mojang Session Server | None | Skin texture URL from player UUID |
| Modrinth | None (PAT optional) | Mod & modpack catalog, CustomSkinLoader |
| CurseForge | API key required | Mod & modpack catalog |
| CurseForge CDN | None | Direct mod file downloads (fallback) |
| Adoptium | None | Auto-download JRE |
