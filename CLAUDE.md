# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Minecrack** is a custom Minecraft launcher built with **Tauri 2.0 (Rust backend) + React 19 (TypeScript/JSX frontend)**. Key design goals: offline-only gameplay (no Microsoft auth), multi-instance management, and support for multiple mod loaders (Vanilla, Fabric, Forge, Quilt).

## Commands

```bash
npm run dev       # Start Vite dev server (port 1420) + Tauri dev window
npm run build     # Production build (Vite + Tauri native bundle)
npm run tauri     # Direct tauri CLI access
```

Rust-only iteration (from `src-tauri/`):
```bash
cargo build       # Compile Rust backend
cargo test        # Run Rust unit tests
cargo check       # Fast type-check without full compilation
```

No JS test framework is currently installed. To add one: Vitest is the recommended choice given the Vite setup.

## Architecture

### Frontend ↔ Backend IPC

All communication between React and Rust goes through `src/lib/tauri.js`, which wraps Tauri's `invoke` (commands) and `listen` (events). In browser dev mode without Tauri, this file returns mock responses so the UI works standalone.

```
React → tauriCmd('command_name', args) → Rust #[tauri::command] fn
Rust  → window.emit("event://name", payload) → tauriListen('event://name', handler) → React
```

Tauri commands are registered in `src-tauri/src/lib.rs` inside `invoke_handler`. Adding a new command: implement `async fn` in `lib.rs`, add to handler list, call from `tauri.js`.

### State Management

`src/store.jsx` — single React Context + `useReducer`. All global state lives here: `instances[]`, `selectedInstanceId`, `profile{}`, `modal`, `download{}`, `gameRunning`. Access via `useStore()` hook. No side effects in the reducer — API calls happen in components or lib utilities.

### Download System (Two-Phase)

1. **Libraries phase** (`src/lib/instances.js` → `installVersion`): fetches Mojang version manifest, builds a download list (client.jar + native libs), runs them through a concurrency-limited queue (default 4 parallel, configurable via `.env`).
2. **Assets phase** (`src/lib/mojang.js` → `installAssets`): ~3000 small texture/sound files downloaded separately and cached by SHA1 hash.

Rust backend (`download_file` command) streams downloads and verifies SHA1 during transfer, emitting `download://progress` events back to the UI.

### Game Launch Flow

`launch_game` command in `lib.rs`:
1. `detect_java` — finds JRE 17+ on the system
2. Build classpath from version JSON + downloaded libraries (`;` on Windows, `:` on Unix — handled in `src/lib/mojang.js`)
3. Spawn `java` via `tokio::process::Command` with offline args (no Microsoft OAuth — UUIDs generated offline via RFC v4 in `src/lib/instances.js`)
4. Pipe stdout/stderr → `game://log` events with level detection (INFO/WARN/ERROR)

### Configuration

`src/config.js` — all API endpoints and defaults sourced from `.env` via Vite's `import.meta.env`. Copy `.env.example` to `.env` to configure. CurseForge requires a free API key; all other APIs (Mojang, Fabric, Quilt, Modrinth, Adoptium) are unauthenticated.

### UI Structure

- `App.jsx` — root layout + modal dispatch (Profile, NewInstance, DownloadOverlay)
- `Sidebar.jsx` — profile card, nav tabs, instance list
- `MainPanel.jsx` — instance detail (hero + Mods/Stats/Console tabs) or welcome screen
- `TitleBar.jsx` — custom window controls (Tauri native decorations are disabled)
- CSS uses `--color-*` variables defined in `index.css`; dark gaming theme with emerald accents

## Implementation Status

Phases 1–3 are complete (scaffold, UI, instance model, download system). Phase 4 improvements completed:
- ✅ **Unified modpack browser** with modal for CurseForge + Modrinth
- ✅ **ForgeWrapper installer detection** fixed (Maven classifier support)
- ✅ **Automatic skin application** via CustomSkinLoader mod
- ✅ **Version resolution robustness** (retry logic + updated fallback tables)

## Phase 4 Improvements (Completed)

### 1. Unified Modpack Browser & Install Modal
**Files**: `ModpackBrowser.jsx`, `ModpackInstallModal.jsx`
- Tabs to switch between Modrinth/CurseForge sources
- Single modal for both platforms (downloads → extracts → imports → mods)
- CurseForge: ZIP download → inspect → import instance → download mods
- Modrinth: Delegates to newInstance modal with prefill (native .mrpack support pending)
- Progress overlay with step tracking (downloading, installing-mods, done)

### 2. ForgeWrapper Installer Detection Fix 🔴 CRITICAL
**Files**: `src/lib/loaders/forge.js`, `src/lib/launcher.js`

**Root cause**: Maven classifier support missing
- Prism Meta returns installer as 4-part name: `net.minecraftforge:forge:1.19.2-43.2.14:installer`
- Old `nameToMavenPath()` only handled 3-part names (group:artifact:version)
- Result: Path never derived, installer never downloaded

**Solution**:
1. Updated `nameToMavenPath()` to handle 4-part Maven coordinates with classifiers
   - `net.minecraftforge:forge:1.19.2-43.2.14:installer` → `net/minecraftforge/forge/1.19.2-43.2.14/forge-1.19.2-43.2.14-installer.jar`
2. Add installer to `mavenFiles` array automatically when ForgeWrapper is detected
3. Pass absolute path via `-Dforgewrapper.installer=/path/to/installer.jar` JVM property
4. Auto-repair legacy profiles lacking formatVersion 2 via `ensureLoaderProfileUpToDate()`
5. Manual "Reinstall Forge" button in instance settings for explicit repair

**Testing**: See `FORGE_INSTALLER_FIX.md` for detailed diagnosis and verification steps

### 3. Automatic Skin Application with CustomSkinLoader
**Files**: `src/lib/skin.js`, `src/lib/launcher.js`, `ProfileModal.jsx`

**Flow**:
1. User uploads PNG skin in ProfileModal → saved as base64 in store
2. At launch (pre-game), `applySkinToInstance()` is called:
   - Searches Modrinth for CustomSkinLoader mod (compatible with loader+version)
   - Downloads JAR to `instances/{id}/mods/`
   - Copies skin PNG to `instances/{id}/CustomSkinLoader/LocalSkin/skins/{username}.png`
   - Writes `CustomSkinLoader.json` config with loadlist
3. CustomSkinLoader mod intercepts Minecraft's SkinManager to serve local PNG
4. Only applies to modded instances (Fabric/Forge/Quilt/NeoForge); vanilla shows warning

**Rust additions**: `write_file_base64()`, `copy_file()`, `delete_file()` commands

### 4. Version Resolution Robustness
**Files**: `src/lib/prism.js`, `src/lib/loaders/forge.js`, `neoforge.js`

**Improvements**:
- **Retry logic with backoff**: `fetchPrism()` retries 3 times on 5xx/transient errors (backoff: 1s/2s/4s)
- **Fail-fast for 4xx**: 404/403 don't retry, fail immediately
- **Updated KNOWN_* tables**: 
  - `KNOWN_FORGE_VERSIONS` now includes 1.21.4-54.1.16, 1.21.3-53.1.10, etc.
  - `KNOWN_NEOFORGE_VERSIONS` now includes 1.21.8-53, 1.20.6-139, etc.
- Used as last fallback when Prism Meta + direct API fail

## Key External APIs

| API | Auth | Used For |
|---|---|---|
| Mojang Version Manifest | None | Game versions, libraries, assets |
| Prism Meta | None | Loader metadata (libraries, mavenFiles, mainClass) |
| Fabric/Quilt Meta | None | Loader versions |
| Forge Maven | None | Forge installer, universal JAR |
| Modrinth | None (PAT optional) | Mod & modpack catalog, CustomSkinLoader |
| CurseForge | API key required | Mod & modpack catalog |
| Adoptium | None | Auto-download JRE |

## Critical Implementation Details

### Maven Classifier Handling
When processing libraries from Prism Meta, library names can be:
- **3-part**: `group:artifact:version` → `group/artifact/version/artifact-version.jar`
- **4-part**: `group:artifact:version:classifier` → `group/artifact/version/artifact-version-classifier.jar`

The `nameToMavenPath()` function in `forge.js` now handles both. Classifiers appear in forge/neoforge installers, some test JARs, and auxiliary files.

### ForgeWrapper Launch Sequence
1. Profile is loaded from `versions/{loaderVersion}/{loaderVersion}.json`
2. If `mainClass` contains "forgewrapper", mark as ForgeWrapper instance
3. Pass `-Dforgewrapper.installer=/absolute/path/forge-VERSION-installer.jar` to JVM
4. ForgeWrapper main class receives this property and executes the installer
5. Installer extracts Forge libraries to disk
6. ForgeWrapper then loads real Forge mainClass and passes control

### Skin Application Timing
- Happens in `launcher.js` after Java detection, before game launch
- Only logs warnings on failure; doesn't block launch (best-effort)
- CustomSkinLoader is downloaded fresh if missing (checked against marker file)
- Profile skin (base64) is read from store and written to PNG on disk
