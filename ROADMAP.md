# Roadmap — Minecrack

> Última revisión: 2026-09-23. Fuentes: `git log`, working tree y la documentación del repo.
> Los comandos de verificación están en [`AGENTS.md`](./AGENTS.md).

## ✅ Completado

- **Lanzador Tauri 2 + React 19** (v1.3.1): instancias múltiples, mod loaders (Vanilla, Fabric, Quilt, Forge/NeoForge), detección automática de Java, skins (Crafatar + subida propia), navegador unificado de modpacks (CurseForge + Modrinth).
- **Ecosistema oficial** (`feat: add official modpack ecosystem sync`):
  - `backend/` — API FastAPI + Postgres (`compose.yaml`), releases inmutables con retiro/rollback (ver [`backend/OPERATIONS.md`](./backend/OPERATIONS.md)).
  - `admin/` — panel de administración (Vite + React).
  - Sync en el lanzador: `remoteModpack` por instancia, eventos `sync://progress`, validación HTTPS (`src/lib/ecosystem-sync.js`, `src-tauri/src/sync.rs`).
- **Fixes**: ventanas de consola suprimidas en Windows (`CREATE_NO_WINDOW`), `copy_dir`, filtro de versión MC en el navegador de packs, fallbacks del pack browser.
- 🔒 **Rotación de API key de CurseForge (2026-09-23)**: la clave vieja estaba en texto plano en `docs/archivo/BUGFIX_SUMMARY.md` (y sigue en el historial de git); se revocó en la consola de CurseForge y la nueva vive solo en `.env` (git-ignored). Lección: una credencial que tocó git se rota en el proveedor, no se borra del archivo.
- **Refactor Rust compila y está verificado (2026-09-23)**: `lib.rs` → módulos (`archives`, `authority`, `network`, `transfers`, `safe_fs`, `processes`); se corrigieron 4 errores (imports `flate2`/`tar`, lifetimes en `processes.rs`, inferencia en `invoke_handler` con validación `authority`); `cargo fmt` aplicado.
  - Verificación: `cargo check` ✅ · `cargo test` 20/20 ✅ · `npm test` 63/63 ✅ · `pytest` 12/12 ✅.

## 🚧 En curso (working tree sin commitear)

- **Commitear el refactor Rust** ya verificado (arriba) + ajustes en descargas/instalación: `src/lib/mojang.js`, `src/lib/downloader.js`, `src/lib/loaders/forge.js`, `src/config.js`, `NewInstanceModal`, `DownloadOverlay`, `src/test/mojang-installation.test.js`.
  - Siguiente paso: commits focalizados (`refactor:`, `feat:`) — verificación ya en verde.

## 📋 Prioridad alta

1. ~~**CI con GitHub Actions**~~ ✅ **Listo (2026-09-23)** — `.github/workflows/ci.yml`: Vitest + build, pytest (Python 3.13), `cargo fmt/check/test` en cada push/PR. Primer run verde: https://github.com/alex0593/Minecrack/actions/runs/35915478452
2. **Completar checklist manual** de [`docs/archivo/IMPLEMENTATION_STATUS.md`](./docs/archivo/IMPLEMENTATION_STATUS.md) (modpack wizard con ambos orígenes, los 5 loaders, skins, indicadores de progreso).
3. **Piloto del ecosistema** antes de despliegue general (de `backend/OPERATIONS.md`): instancia Fabric pequeña; verificar actualización, JAR corrupto, JAR adicional, interrupción de red y rollback.
4. **Publicar v1.3.2** con el refactor ya commiteado y CI activo.

## 🟡 Prioridad media

5. **ESLint + Prettier** — cero herramientas de lint/format hoy; sin formatador, la consistencia depende del autor (ver `AGENTS.md` § "No JavaScript linter...").
6. **CSP real en `src-tauri/tauri.conf.json`** — actualmente `"csp": null`; la app descarga y ejecuta contenido externo, merece una política estricta.
7. **Rate limiting / bloqueo de intentos en el login admin** (`backend/app/main.py`) — solo hay JWT + CSRF, sin protección contra fuerza bruta.
8. **Reducir `unwrap()` en Rust** — `sync.rs` (17), `safe_fs.rs` (8), `archives.rs` (7): un panic tumba el launcher; convertir a `Result<_, String>` como el resto del código.
9. **Tests de endpoints admin** — backend: ~20 endpoints, solo 12 tests (ninguno de publish/rollback, que son críticos); panel `admin/`: 0 tests.

## 💡 Backlog

- **Auto-update del launcher** — no está `plugin-updater`; hoy cada release requiere descarga manual.
- **Limpieza de `console.log`** — ~93 llamadas en producción (`launcher.js` 59, `forge.js` 34); redirigir a `game://log` o hacerlas condicionales.
- **Dividir componentes gigantes** — `MainPanel.jsx` (1101 líneas), `ModpackImportWizard.jsx` (837), `ModpackDownloadModal.jsx` (629).
- **E2E** (Playwright o Tauri driver) — la checklist de verificación es 100% manual.
- **i18n** — toda la UI está hardcodeada en español; solo si se quiere soporte multiidioma.
- Limitaciones conocidas (de [`docs/archivo/IMPLEMENTATION_STATUS.md`](./docs/archivo/IMPLEMENTATION_STATUS.md)):
  - Skins en instancias Vanilla no soportadas.
  - Mods de CurseForge se descargan en serie (paralelizar, máx. 4 como en `curseforge-downloader.js`).
  - El selector de versión solo muestra las 5 versiones más recientes de Minecraft.
  - `.mrpack` de Modrinth delega la resolución de mods a `NewInstanceModal`.
- Botón "Reinstalar Forge" explícito en `MainPanel.jsx` (la auto-reparación cubre la mayoría de casos).
- Recolección de objetos sin referencias en el almacenamiento del ecosistema (mencionado en `backend/OPERATIONS.md`).

## 📚 Documentación

- Guía de arquitectura del lanzador: [`CLAUDE.md`](./CLAUDE.md)
- Instrucciones para agentes/comandos: [`AGENTS.md`](./AGENTS.md)
- Usuario: [`README.md`](./README.md) · Backend: [`backend/README.md`](./backend/README.md) · Operaciones: [`backend/OPERATIONS.md`](./backend/OPERATIONS.md)
- Históricos (obsoletos, referencia): [`docs/archivo/`](./docs/archivo/)
