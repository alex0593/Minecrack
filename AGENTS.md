# Repository Guidelines

## Project Structure & Module Organization

Three apps live in this repo:

- **Root — Tauri 2 launcher**: React frontend in `src/` (UI in `src/components/`, hooks in `src/hooks/`, business and API logic in `src/lib/`, global state in `src/store/`); Rust backend in `src-tauri/src/`. Keep all IPC behind the `src/lib/tauri/` barrel. Tauri commands are registered in `src-tauri/src/lib.rs`, which delegates to the `sync`, `safe_fs`, `archives`, `authority`, `network`, `transfers`, and `processes` modules. Tauri config and icons are under `src-tauri/`; launcher tests live in `src/test/`; component CSS sits beside its JSX file.
- **`backend/` — modpack ecosystem API**: FastAPI + SQLModel on Python 3.13, Postgres via `compose.yaml`, Alembic migrations in `backend/migrations/`, Python tests in `backend/tests/`, ops runbook in `backend/OPERATIONS.md`.
- **`admin/` — admin panel**: standalone Vite + React app (its own `package.json`).

## Build, Test, and Development Commands

Launcher (run from repo root):

- `npm run dev` starts the browser-only Vite server on port 1420 (strict). It does **not** open the Tauri window — use `npm run tauri dev` for the full desktop app.
- `npm run build` produces the frontend bundle only; `npm run tauri build` creates the native production bundle.
- `npm test` runs the Vitest suite once; `npm run test:watch` reruns affected tests; `npx vitest run src/test/instances.test.js` runs one file.
- `cd src-tauri && cargo check` quickly validates Rust changes; `cargo test` for Rust tests; `cargo fmt --check` before committing Rust work (CI enforces it).

Backend:

- `docker compose up --build` from the repo root (requires `backend/.env` copied from `backend/.env.example`). API on `http://localhost:8000`, OpenAPI at `/docs`; the container runs `alembic upgrade head` on start.
- `cd backend && pytest` — tests are self-contained (in-memory SQLite + `tmp_path`); no Postgres needed.

Admin:

- `cd admin && npm install && npm run dev` — serves on port 1421 and proxies `/api` to `http://localhost:8000`.

No JavaScript linter or formatter is configured; preserve nearby formatting. CI runs on every push/PR to `main` (`.github/workflows/ci.yml`): Vitest + `npm run build`, `pytest` from `backend/`, and `cargo fmt --check` + `cargo check` + `cargo test` from `src-tauri/` — keep all four green.

## IPC & Browser-Dev Gotchas

`tauriCmd` in `src/lib/tauri/` silently falls back to mock responses whenever `invoke` is unavailable **or a Rust command fails** — backend bugs will not throw in browser mode. `tauriStrictCmd` throws instead (used for `sync_instance` and `restore_quarantine`). Always debug integration issues inside `npm run tauri dev`, never the browser. Prefer the typed wrappers in `src/lib/tauri/` (`launchGame`, `detectJava`, `downloadFile`, …) over raw `tauriCmd`.

## Ecosystem Sync

An instance may carry `remoteModpack: { apiBaseUrl, modpackId, tracking: 'active' | 'pinned', releaseId? }`, validated in `src/lib/ecosystem-sync.js` (HTTPS required; HTTP only for localhost). Progress arrives via `sync://progress` events; the Rust side is `src-tauri/src/sync.rs`. Publishing a release retires the previous one without deleting its files — rollbacks republish the old release (see `backend/OPERATIONS.md`).

## Coding Style & Naming Conventions

Follow the existing ES-module React style: 2-space indentation, semicolons, single quotes, and functional components. Name components in PascalCase (`ProfileModal.jsx`), hooks with a `use` prefix, and utilities in lowercase kebab-case. Use uppercase reducer actions such as `UPDATE_INSTANCE`.

## Testing Guidelines

Tests use Vitest, jsdom, and Testing Library with setup from `src/test/setup.js`. Name suites `*.test.js` and place them in `src/test/`. Cover reducers, persistence contracts, loader resolution, and changed error paths. No coverage threshold is enforced; inspect it with `npx vitest run --coverage`. Backend tests: `cd backend && pytest`.

## Commit & Pull Request Guidelines

Recent history favors concise imperative subjects, often with prefixes such as `fix:`, `feat:`, or `release:`. Keep each commit focused, for example `fix: preserve disabled mods during import`. Pull requests should explain the user-visible impact, list verification commands, link relevant issues, and include screenshots or recordings for UI changes. Call out platform-specific behavior and any configuration or API-key requirements.

## Security & Configuration

Keep API keys in local `.env` files and never commit credentials (root `.env.example` for the launcher's `VITE_*` vars, `backend/.env.example` for the API). Treat filesystem paths, downloaded archives, and external API responses as untrusted input, especially in Rust commands.

## Docs Map

- `ROADMAP.md` — current status: done / in progress / next / backlog (Spanish).
- `CLAUDE.md` — launcher architecture deep-dive (English).
- `README.md`, `backend/README.md`, `backend/OPERATIONS.md` — user and ops docs (Spanish).
- `docs/archivo/` — superseded historical notes; contains a leaked CurseForge API key that must be treated as compromised.
