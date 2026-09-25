# Roadmap — Minecrack

> Última revisión: 2026-09-24. Fuentes: `git log`, working tree y la documentación del repo.
> Los comandos de verificación están en [`AGENTS.md`](./AGENTS.md).

## ✅ Completado

- **Lanzador Tauri 2 + React 19** (v1.3.2): instancias múltiples, mod loaders (Vanilla, Fabric, Quilt, Forge/NeoForge), detección automática de Java, skins (Crafatar + subida propia), navegador unificado de modpacks (CurseForge + Modrinth).
- **Ecosistema oficial** (`feat: add official modpack ecosystem sync`):
  - `backend/` — API FastAPI + Postgres (`compose.yaml`), releases inmutables con retiro/rollback (ver [`backend/OPERATIONS.md`](./backend/OPERATIONS.md)).
  - `admin/` — panel de administración (Vite + React).
  - Sync en el lanzador: `remoteModpack` por instancia, eventos `sync://progress`, validación HTTPS (`src/lib/ecosystem-sync.js`, `src-tauri/src/sync.rs`).
- **Fixes**: ventanas de consola suprimidas en Windows (`CREATE_NO_WINDOW`), `copy_dir`, filtro de versión MC en el navegador de packs, fallbacks del pack browser.
- 🔒 **Rotación de API key de CurseForge (2026-09-23)**: la clave vieja estaba en texto plano en `docs/archivo/BUGFIX_SUMMARY.md` (y sigue en el historial de git); se revocó en la consola de CurseForge y la nueva vive solo en `.env` (git-ignored). Lección: una credencial que tocó git se rota en el proveedor, no se borra del archivo.
- **Refactor Rust compila y está verificado (2026-09-23)**: `lib.rs` → módulos (`archives`, `authority`, `network`, `transfers`, `safe_fs`, `processes`); se corrigieron 4 errores (imports `flate2`/`tar`, lifetimes en `processes.rs`, inferencia en `invoke_handler` con validación `authority`); `cargo fmt` aplicado.
  - Verificación: `cargo check` ✅ · `cargo test` 20/20 ✅ · `npm test` 63/63 ✅ · `pytest` 12/12 ✅.

## 📋 Prioridad alta

1. ~~**CI con GitHub Actions**~~ ✅ **Listo (2026-09-23)** — `.github/workflows/ci.yml`: Vitest + build, pytest (Python 3.13), `cargo fmt/check/test` en cada push/PR. Primer run verde: https://github.com/alex0593/Minecrack/actions/runs/35915478452
2. **Completar checklist manual** de [`docs/archivo/IMPLEMENTATION_STATUS.md`](./docs/archivo/IMPLEMENTATION_STATUS.md) (modpack wizard con ambos orígenes, los 5 loaders, skins, indicadores de progreso).
3. **Piloto del ecosistema** antes de despliegue general (de `backend/OPERATIONS.md`): instancia Fabric pequeña; verificar actualización, JAR corrupto, JAR adicional, interrupción de red y rollback.
4. ~~**Refactor Rust (lib.rs → módulos)**~~ ✅ Listo (`15c5730`, verificado y en CI).
5. ~~**Publicar v1.3.2**~~ ✅ **Listo (2026-09-24)** — https://github.com/alex0593/Minecrack/releases/tag/v1.3.2 con AppImage + deb + rpm (se publicó antes de cerrar las Fases 3–5, que se completaron en `feat/ui-refresh`). ~~*Siguiente release*~~ **v1.5.0** ✅ **Publicada (2026-09-25)** — https://github.com/alex0593/Minecrack/releases/tag/v1.5.0 con AppImage + deb + rpm, tras fusionar el [PR #1](https://github.com/alex0593/Minecrack/pull/1) en `main` con rebase (13 commits, CI verde). El tag `v1.4.0` ya estaba tomado por la release del 13/06/2026, de ahí el salto de versión.

## 🧭 Iniciativa activa — Renovación de UI + refactor por fases

Decisiones (2026-09-23): por fases · pulido coherente (mantener ADN oscuro/esmeralda) · paquete final AppImage + deb + rpm. Flujo: rama `feat/ui-refresh`, un PR por fase, CI verde en cada una.

- ~~**Fase 0 — Baseline**~~ ✅ **Listo (2026-09-23)** — build release (deb ✅ rpm ✅, AppImage falló por `linuxdeploy`, ver hallazgo 5), app ejecutada y **7 capturas** de referencia en `/tmp/opencode/ui-baseline/`; 5 hallazgos UX (incl. `WebKitWebProcess` al 72 % de CPU con UI muda) documentados en [`docs/ui-baseline.md`](./docs/ui-baseline.md).
- ~~**Fase 1 — Sistema de diseño**~~ ✅ **Listo (2026-09-23)** — `src/components/ui/` completado con Button, Input, Modal, Tabs, Badge, Spinner, Skeleton, Tooltip, Toast y Card sobre los tokens de `src/index.css` (sin librerías externas); `<Modal>` unifica Esc global/overlay/× (cierra el hallazgo 2 de [`docs/ui-baseline.md`](./docs/ui-baseline.md)) y `ErrorModal` ya va migrado; `ToastViewport` montado en `App.jsx`. 25 tests nuevos en `src/test/ui-primitives.test.jsx` (88/88 en total) y `npm run build` verde.
- ~~**Fase 2 — Componentizar gigantes**~~ ✅ **Listo (2026-09-23)** — splits *verbatim* (extracción programática, sin cambios de comportamiento): `MainPanel.jsx` 1101→314 (+`main-panel/`: WelcomeView, PacksTab, ModsTab, StatsTab, ConsoleTab), `ModpackImportWizard.jsx` 837→128 (+`modpack-import-wizard/`: Step1–4, ModpackCard), `ModpackDownloadModal.jsx` 629→360 (+`modpack-download-modal/`: Search/Preview/Progress/Error views + card), `ModBrowserModal.jsx` 539→257 (+`mod-browser-modal/`: ModCard, ModDetail). CSS repartido: `ModpackImportWizard.css` 747→211, `MainPanel.css` 576→262, `ModBrowserModal.css` 372→149 (selectores compartidos verificados por grep y conservados en el shell). Rutas/props públicos intactos; `npm test` 88/88 y `npm run build` verdes.
  - *Segunda pasada (2026-09-23)*: profundiza los splits sin tocar comportamiento — `MainPanel.jsx` 314→**39** (+`main-panel/`: InstanceDetail, InstanceHero, InstanceTabs, SyncStatusBar), `ModBrowserModal.jsx` 272→**186** (+`mod-browser-modal/`: VanillaGuard, FilterBar, ModResultsList); corregido el import huérfano de `ModpackCard.css` perdido en el primer reparto; `npm test` **92/92** y build verdes (2 tests nuevos blindan los fixes de abajo).
- ~~**Fase 3 — Renovación visual**~~ ✅ **Listo (2026-09-24)** — orden seguido shell+sidebar → panel principal → wizards → modales: `ErrorModal` inline → `ui/ErrorModal`, CSS de consola movido a `main-panel/ConsoleTab.css`, `SetupWizard`/`NewInstanceModal` sobre `<Modal>` + `StepsIndicator` (fix: `ProgressBar percent→value`), 7 modales migrados a `<Modal>` (Export/ImportMods/ModsPreview/Verify/ModpackInstall/ModpackDownload + guard), `select` nativos tematizados, `:focus-visible` global y autofocus preservado en `<Modal>`. Fixes del baseline: hallazgos **3** (selects blancos), **7** (`loadMore` desalineado) y **8** (shell de modal sin CSS → `<Modal>`) cerrados; hallazgo 1 sin reproducir durante la verificación. Verificación: `npm test` 92/92 ✅ · `npm run build` ✅ · 8 pares de capturas antes/después en Xvfb aislado (`:99`, 86,6–98,3 % de píxeles iguales) — ver [`docs/ui-baseline.md`](./docs/ui-baseline.md).
- ~~**Fase 4 — Refactor estructural**~~ ✅ **Listo (2026-09-24)** — splits con barrel, **cero imports de consumidores modificados**: `tauri.js` (762) → `src/lib/tauri/` (`core`, `mock`, `fs`, `downloads`, `mods`, `packs`, `instances`, `game`, `dialog` + `index.js` con los mismos **47 exports**; `mock.js` queda API interna), `launcher.js` (562) → `src/lib/launcher/` (`profiles`, `launch`, `events` + `index.js` con named + default; caché de Java singleton en `profiles.js`), `store.jsx` (262) → `src/store/` (`initial-state` + `slices/config|instances|session|game|error` + `reducer.js` combinador + `index.jsx` con `StoreProvider`/`useStore`/`useStoreState`/`useDispatch`; `SET_GAME_RUNNING` verbatim en un único slice). Los barrels resuelven `../lib/tauri`, `../lib/launcher` y `../store` sin tocar a los 52 importadores. Verificación: `npm test` 92/92 ✅ (contrato del store blinda los slices) · `npm run build` ✅ · paridad mecánica de exports/24 acciones vs `HEAD`.
- ~~**Fase 5 — Reempaquetar y cerrar**~~ ✅ **Listo (2026-09-24)** — build final con la receta del hallazgo 5 (`PATH=<venv>/bin:$PATH PKG_CONFIG_PATH=<stub> npm run tauri build`) → **deb 6,0 MB + rpm 6,0 MB + AppImage 88,9 MB**, tests de integridad OK (`dpkg-deb -I`, magic `edabeedb`, extracción del AppImage con binario ejecutable dentro). Ejecución del binario final (el mismo de los 3 formatos) en Xvfb `:99` con el protocolo de la Fase 3: 8 capturas **8/8 checks PASS a la primera** (cajas `00`/`03` recalibradas: las originales fallaban incluso sobre las propias capturas de la Fase 3). Diff: final vs baseline **replica la tabla de la Fase 3** (76,1–98,3 % de píxeles iguales, ≤0,1 pp de desviación) y final vs «después» Fase 3 = **99,8–100 %** → el refactor de la Fase 4 y el empaquetado no cambian ni un píxel visible. Capturas en `~/.ui-captures/final-phase5/`; tablas y receta en [`docs/ui-baseline.md`](./docs/ui-baseline.md). Artefactos locales (no se publica: v1.3.2 ya está publicada).

## 🟡 Prioridad media

6. **ESLint + Prettier** — cero herramientas de lint/format hoy; sin formatador, la consistencia depende del autor (ver `AGENTS.md` § "No JavaScript linter...").
7. **CSP real en `src-tauri/tauri.conf.json`** — actualmente `"csp": null`; la app descarga y ejecuta contenido externo, merece una política estricta.
8. ~~**Rate limiting / bloqueo de intentos en el login admin**~~ ✅ **Listo (`0b3076a`, 2026-09-25)** — ventana deslizante en `backend/app/ratelimit.py`: 5 intentos fallidos / 300 s por usuario+cliente → `429` con `Retry-After`; el éxito limpia el contador, los 429 no se registran (una ráfaga no prolonga el bloqueo) y las claves caducadas se purgan. Configurable con `LOGIN_MAX_ATTEMPTS` / `LOGIN_WINDOW_SECONDS` (en `.env.example`). Verificación: `pytest` 16/16 (4 tests nuevos).
9. ~~**Reducir `unwrap()` en Rust**~~ ✅ **Listo (`0d87093`, 2026-09-25)** — el recuento original incluía `#[cfg(test)]`; en producción solo había **5 sitios**, todos convertidos a error recuperable: `safe_fs::lock` (poisoning → `into_inner`), `archives::tar_runtime_to_stage` (`parent()` → `ok_or`), `processes::logs` (`pop` → `if let`) y `processes::launch` (`take()` de stdout/stderr → `ok_or`); `sync.rs` y el resto del código tenían **0** en producción. El `.expect` del bootstrap Tauri en `lib.rs` se deja a propósito (si el event loop no arranca, no hay UI). Verificación: `cargo fmt --check` ✅ · `cargo check` ✅ · `cargo test` 20/20 ✅.
10. ~~**Tests de endpoints admin**~~ ✅ **Listo (`82f62d3` + `5d34776`, 2026-09-25)** — backend: `tests/test_admin_endpoints.py` con 8 tests nuevos por HTTP (guard 401/403 con sesión+CSRF, logout, 409 de slugs/versiones/archivos, 404/422 de releases, manifests públicos y health) → **24/24**; el workflow ya cubría publish/rollback *happy path*. Panel `admin/`: vitest + jsdom + Testing Library con 3 *smoke tests* (login, error de credenciales, dashboard con CSRF) y job **Admin panel (Vitest)** en CI (documentado en `AGENTS.md`).

## 💡 Backlog

- **Auto-update del launcher** — no está `plugin-updater`; hoy cada release requiere descarga manual.
- **Limpieza de `console.log`** — ~93 llamadas en producción (`launcher.js` 59, `forge.js` 34); redirigir a `game://log` o hacerlas condicionales.
- **E2E** (Playwright o Tauri driver) — la checklist de verificación es 100% manual.
- **i18n** — toda la UI está hardcodeada en español; solo si se quiere soporte multiidioma.
- Limitaciones conocidas (de [`docs/archivo/IMPLEMENTATION_STATUS.md`](./docs/archivo/IMPLEMENTATION_STATUS.md)):
  - Skins en instancias Vanilla no soportadas.
  - Mods de CurseForge se descargan en serie (paralelizar, máx. 4 como en `curseforge-downloader.js`).
  - `.mrpack` de Modrinth delega la resolución de mods a `NewInstanceModal`.
- Botón "Reinstalar Forge" explícito en `MainPanel.jsx` (la auto-reparación cubre la mayoría de casos).
- Recolección de objetos sin referencias en el almacenamiento del ecosistema (mencionado en `backend/OPERATIONS.md`).

## 📚 Documentación

- Guía de arquitectura del lanzador: [`CLAUDE.md`](./CLAUDE.md)
- Instrucciones para agentes/comandos: [`AGENTS.md`](./AGENTS.md)
- Usuario: [`README.md`](./README.md) · Backend: [`backend/README.md`](./backend/README.md) · Operaciones: [`backend/OPERATIONS.md`](./backend/OPERATIONS.md)
- Históricos (obsoletos, referencia): [`docs/archivo/`](./docs/archivo/)
