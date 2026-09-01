# Repository Guidelines

## Project Structure & Module Organization

Minecrack is a Tauri 2 application with a React frontend and Rust backend. Frontend UI lives in `src/components/`, hooks in `src/hooks/`, business and API logic in `src/lib/`, and global state in `src/store.jsx`. Keep IPC calls behind `src/lib/tauri.js`. Native commands belong in `src-tauri/src/`; Tauri configuration and icons are under `src-tauri/`. Tests live in `src/test/`, while component CSS sits beside its JSX file.

## Build, Test, and Development Commands

- `npm run dev` starts the browser-only Vite server on port 1420.
- `npm run tauri dev` launches the complete desktop app with the Rust backend.
- `npm run build` produces the frontend bundle.
- `npm run tauri build` creates a native production bundle.
- `npm test` runs the Vitest suite once; `npm run test:watch` reruns affected tests.
- `npx vitest run src/test/instances.test.js` runs one test file.
- `cd src-tauri && cargo check` quickly validates Rust changes; use `cargo test` for Rust tests.

## Coding Style & Naming Conventions

Follow the existing ES-module React style: 2-space indentation, semicolons, single quotes, and functional components. Name components in PascalCase (`ProfileModal.jsx`), hooks with a `use` prefix, and utilities in lowercase kebab-case. Use uppercase reducer actions such as `UPDATE_INSTANCE`. Run `cargo fmt --check` for Rust. No JavaScript linter is configured, so preserve nearby formatting.

## Testing Guidelines

Tests use Vitest, jsdom, and Testing Library setup from `src/test/setup.js`. Name suites `*.test.js` and place them in `src/test/`. Cover reducers, persistence contracts, loader resolution, and changed error paths. No coverage threshold is enforced; inspect it with `npx vitest run --coverage`. Test IPC behavior in Tauri because browser mode may return mocks.

## Commit & Pull Request Guidelines

Recent history favors concise imperative subjects, often with prefixes such as `fix:`, `feat:`, or `release:`. Keep each commit focused, for example `fix: preserve disabled mods during import`. Pull requests should explain the user-visible impact, list verification commands, link relevant issues, and include screenshots or recordings for UI changes. Call out platform-specific behavior and any configuration or API-key requirements.

## Security & Configuration

Keep API keys in local `.env` files and never commit credentials. Treat filesystem paths, downloaded archives, and external API responses as untrusted input, especially in Rust commands.
