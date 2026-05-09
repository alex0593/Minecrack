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

Phases 1–2 are complete (scaffold, UI, instance model). Phase 3 (download system) is coded but not fully end-to-end tested. Phases 4–8 (loader installers, mod browser, game launch, polish) are not yet implemented.

## Key External APIs

| API | Auth | Used For |
|---|---|---|
| Mojang Version Manifest | None | Game versions, libraries, assets |
| Fabric/Quilt Meta | None | Loader versions |
| Forge Maven | None | Forge installer |
| Modrinth | None (PAT optional) | Mod catalog |
| CurseForge | API key required | Alternative mod source |
| Adoptium | None | Auto-download JRE |
