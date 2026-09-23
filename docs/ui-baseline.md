# Baseline de UI — Fase 0 (2026-09-23)

Capturas de referencia del estado real de la app **antes** de la renovación, en la rama
`feat/ui-refresh`. Complementan la Fase 0 de [`ROADMAP.md`](../ROADMAP.md) y alimentan
las Fases 1–3.

## Capturas

Las imágenes no se versionan (binarios); viven en `/tmp/opencode/ui-baseline/`:

| Archivo | Superficie capturada |
|---|---|
| `03-instance-detail.png` | Detalle de instancia: hero (icono, badges MC/loader/mods, botón Jugar), fila de stats, tabs Mods/Recursos/Shaders/Stats/Consola, empty state de mods |
| `04-settings.png` | Configuración: Perfil/usuario offline, Java (ruta + "Detectar automáticamente"), Directorio del launcher |
| `05-modpack-browser.png` | Modal *Explorador de Modpacks*: tabs Modrinth/CurseForge, filtros, cards, "Cargar más modpacks" |
| `06-new-instance.png` | Modal *Nueva instancia* (paso 1 de 2): picker de icono, nombre, selector de versión |
| `07-console-tab.png` | Tab Consola: filtros TODO/INFO/WARN/ERROR, buscador, Copiar/Limpiar, tabla de logs |
| `08-add-mod.png` | Modal *Explorar Mods* con el aviso `Vanilla no soporta mods` |
| `09-import-instance.png` | Modal *Importar instancia*: checklist de 3 puntos + Cancelar/Importar |

Entorno: binario release de `npm run tauri build` sobre XFCE/X11 (1920×1080, ventana de
la app 1200×760).

## Hallazgos UX detectados en la baseline (entrada para Fases 2–3)

1. **Web process en bucle (grave)** — al activar la tab Consola o abrir *Explorar Mods*,
   `WebKitWebProcess` subió a ~72 % de CPU y la UI quedó muda: `Esc`, `×` y `Cerrar`
   dejaron de responder (retraso de cola de varios segundos; solo un reinicio de la app
   lo resolvió). Sospecha: polling/render de logs o del modal en bucle. Merece
   reproducirse y un `fix:` propio antes o durante la Fase 3.
   - **Estado (2026-09-23)**: auditoría estática completada (timers, listeners,
     `useEffect` de los hooks y del store: sin bucles; logs capados a 500). Se corrigió
     una violación de *rules of hooks* en `ModBrowserModal` (guard de vanilla como
     early-return antes de 13 hooks → `fix: keep mod browser hook count stable across
     loaders`), que era clase de crash pero **no explica por sí sola** el bucle de CPU:
     la causa raíz queda **sin confirmar**; vigilar durante la verificación de la Fase 3
     y, si reaparece, reproducir con devtools abiertos.
2. **Cierre inconsistente de modales**:
   - *Nueva instancia*: `×` no cerró; `Esc` solo funcionó cuando el foco **no** estaba en
     un input (el modal autofocusa "Nombre", así que parece roto); `Cancelar` siempre cerró.
   - *Explorar Mods* (error vanilla): `Esc` no cierra; solo el botón `Cerrar`.
   - *Explorador de Modpacks*: cerró con `Esc`.
   - Unificar: handler global de `Esc`, y que `×` y el overlay cierren siempre.
3. **Select blanco sobre modal oscuro** — el filtro de orden del *Explorador de Modpacks*
   se renderiza con fondo blanco (¿`<select>` nativo o `Select` sin tema oscuro?); rompe
   la coherencia del tema.
4. **Lag de repintado** — la primera activación de la tab Consola tardó >1,4 s en
   reflejarse; con la app bajo carga, las capturas tomadas antes de ~3–5 s mostraban el
   estado anterior.
5. **AppImage no empaqueta** — `npm run tauri build` generó `deb` y `rpm`, pero el paso
   AppImage falló con `failed to run linuxdeploy` (falta `patchelf` en el entorno).
   Resolver en la Fase 5.

## Hallazgos adicionales (post-baseline, descubiertos en la Fase 3)

6. **«Limpiar» de la consola no limpiaba** — el botón despachaba
   `SET_GAME_RUNNING {running:false}`, que no toca `gameLogs`. **Corregido** con la
   acción dedicada `CLEAR_GAME_LOGS` (test: `src/test/console-clear.test.jsx`).
7. **«Cargar más» del navegador de mods desalineado** — `loadMore` pasa `filterType` en
   el hueco `source` de `doSearch(q, version, loader, source, type, off)`, así que
   repite la búsqueda con los offsets en el lugar equivocado. Pendiente de `fix:`
   (candidato a Fase 3).
8. **Clases de shell de modal sin reglas CSS** — `modal-overlay`, `modal-content`,
   `modal-header`, `modal-body` no existen en ningún CSS de `src/` (solo
   `.ui-modal-overlay` de `ui/Modal.css`); modales como `ModpackDownloadModal`,
   `ExportInstanceModal` o `ImportModsModal` se pintan sin esos estilos. Lo resuelve
   naturalmente la migración de modales a `<Modal>` en la Fase 3.

## Regeneración / automatización (también útil en Fase 5)

- Clicks X11 con `pyautogui` (venv en `/tmp/opencode/venv-x11`); mapeo de coordenadas
  verificado exacto contra Xlib (`root.query_pointer`).
- `gnome-screenshot` funciona con fallback X11 sin GNOME Shell.
- La ventana se localiza por `wm_name='Minecrack'` con búsqueda **recursiva** (xfwm4
  re-emparenta ventanas) y se trae al frente con `_NET_ACTIVE_WINDOW`.
- Esperar 3–5 s entre acción y captura (lag de repintado, hallazgo 4) y **verificar
  siempre** la imagen leída.
