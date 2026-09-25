# Baseline de UI — Fase 0 (2026-09-23)

Capturas de referencia del estado real de la app **antes** de la renovación, en la rama
`feat/ui-refresh`. Complementan la Fase 0 de [`ROADMAP.md`](../ROADMAP.md) y alimentan
las Fases 1–3.

## Capturas

Las imágenes no se versionan (binarios); viven en `/tmp/opencode/ui-baseline/` (regeneradas el
2026-09-24 en el Xvfb aislado `:99`) con copia durable en `~/.ui-captures/before-phase3/` —
`/tmp` se borra en cada reinicio del servidor. El set «después» (Fase 3) está en
`/tmp/opencode/ui-after/` con copia en `~/.ui-captures/after-phase3/`.

| Archivo | Superficie capturada |
|---|---|
| `00-launch.png` | Arranque: vista de bienvenida (pickaxe, CTA «Crear primera instancia»/«Explorar mods») con el sidebar |
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
   - **Estado (2026-09-24)**: la auditoría estática de 2026-09-23 no halló bucles y la
     verificación de la Fase 3 (8 superficies, modales, consola) **no reprodujo** la
     mudez de la UI; la causa raíz sigue **sin confirmar** — si reaparece, reproducir
     con devtools y `ps` de `WebKitWebProcess`.
2. **Cierre inconsistente de modales**:
   - *Nueva instancia*: `×` no cerró; `Esc` solo funcionó cuando el foco **no** estaba en
     un input (el modal autofocusa "Nombre", así que parece roto); `Cancelar` siempre cerró.
   - *Explorar Mods* (error vanilla): `Esc` no cierra; solo el botón `Cerrar`.
   - *Explorador de Modpacks*: cerró con `Esc`.
   - Unificar: handler global de `Esc`, y que `×` y el overlay cierren siempre.
   - **Estado (Fases 1+3)**: `<Modal>` unifica Esc/×/overlay y en la Fase 3 se migraron
     los 3 modales citados (más Export/ImportMods/ModsPreview/Verify/ModpackInstall/
     ModpackDownload); queda **pendiente de QA manual** la prueba explícita de `Esc`
     en cada uno (la capturación solo validó `×`/`Cerrar` por clic).
3. **Select blanco sobre modal oscuro** — el filtro de orden del *Explorador de Modpacks*
   se renderiza con fondo blanco (¿`<select>` nativo o `Select` sin tema oscuro?); rompe
   la coherencia del tema.
   - **Estado (Fase 3): corregido** — los `<select>` nativos reciben tema oscuro en
     `src/index.css`; verificado en `05-modpack-browser` y `06-new-instance` («después»).
4. **Lag de repintado** — la primera activación de la tab Consola tardó >1,4 s en
   reflejarse; con la app bajo carga, las capturas tomadas antes de ~3–5 s mostraban el
   estado anterior.
5. **AppImage no empaqueta** — `npm run tauri build` generó `deb` y `rpm`, pero el paso
   AppImage falló con `failed to run linuxdeploy` (falta `patchelf` en el entorno).
   Resolver en la Fase 5.
   - **Estado (2026-09-24): resuelto en v1.3.2** — dos causas: (1) `patchelf`
     ausente → instalado en el venv sin sudo (`pip install patchelf` en
     `/tmp/opencode/venv-x11`); (2) el plugin GTK de linuxdeploy abortaba con
     `no 'libdir' variable for 'librsvg-2.0'` (falta `librsvg2-dev`, sin sudo) →
     stub `/tmp/opencode/pkgconfig/librsvg-2.0.pc` con `libdir` correcto.
     Receta de build: `PATH=<venv>/bin:$PATH PKG_CONFIG_PATH=<stub-dir> npm run tauri build`.
     Los 3 formatos ya empaquetan (AppImage 88,9 MB, test de extracción OK),
      reconfirmado en la Fase 5 (2026-09-24) con los 3 tests de integridad (dpkg-deb, magic rpm, extracción AppImage).

## Hallazgos adicionales (post-baseline, descubiertos en la Fase 3)

6. **«Limpiar» de la consola no limpiaba** — el botón despachaba
   `SET_GAME_RUNNING {running:false}`, que no toca `gameLogs`. **Corregido** con la
   acción dedicada `CLEAR_GAME_LOGS` (test: `src/test/console-clear.test.jsx`).
7. **«Cargar más» del navegador de mods desalineado** — `loadMore` pasa `filterType` en
   el hueco `source` de `doSearch(q, version, loader, source, type, off)`, así que
   repite la búsqueda con los offsets en el lugar equivocado.
   - **Estado (Fase 3): corregido** — argumentos alineados en el plan de fases 3.
8. **Clases de shell de modal sin reglas CSS** — `modal-overlay`, `modal-content`,
   `modal-header`, `modal-body` no existen en ningún CSS de `src/` (solo
   `.ui-modal-overlay` de `ui/Modal.css`); modales como `ModpackDownloadModal`,
   `ExportInstanceModal` o `ImportModsModal` se pintan sin esos estilos.
   - **Estado (Fase 3): corregido** — los 7 modales citados migraron a `<Modal>`,
     que sí trae su shell CSS.

## Comparación antes/después de la Fase 3 (2026-09-24)

Mismos 8 superficies, mismo entorno (Xvfb `:99`, ventana 1200×760): binario v1.3.2
(`tauri-app-v132-before-phase3`) a la izquierda, build de la Fase 3 a la derecha.
% de píxeles casi idénticos (Δ≤7) y diferencia media (0–255):

| Captura | Iguales | Diff media | Comentario |
|---|---|---|---|
| `00-launch` | 97,4 % | 1,58 | pulido de tokens en sidebar/bienvenida |
| `03-instance-detail` | 96,1 % | 2,63 | mismo layout; tipografía y badges afinados |
| `04-settings` | 98,3 % | 0,89 | casi idéntico (secciones + footer «Guardar cambios») |
| `05-modpack-browser` | 86,6 % | 13,93 | mayor cambio: `StepsIndicator` nuevo + select oscuro (hallazgo 3) |
| `06-new-instance` | 94,1 % | 2,51 | barra de progreso + select oscuro |
| `07-console-tab` | 96,7 % | 1,89 | CSS movido a `ConsoleTab.css` (idéntico byte a byte) |
| `08-add-mod` | 76,1 % | 4,95 | guard re-pintado con el shell de `<Modal>` (centrado y tokens) |
| `09-import-instance` | 97,3 % | 1,00 | componente sin migrar: prácticamente idéntico |

Sin cambios de comportamiento: rutas de navegación, modales y acciones responden igual
(los 8 estados se alcanzaron con la misma secuencia de clics en ambos binarios).

## Verificación final (Fase 5, 2026-09-24)

**Build** con la receta del hallazgo 5
(`PATH=/tmp/opencode/venv-x11/bin:$PATH PKG_CONFIG_PATH=/tmp/opencode/pkgconfig npm run tauri build`)
→ los 3 formatos, con tests de integridad:

| Artefacto (`src-tauri/target/release/bundle/`) | Tamaño | Integridad |
|---|---|---|
| `deb/Minecrack_1.3.2_amd64.deb` | 6,0 MB | `dpkg-deb -I` ✓ — `minecrack`, Depends: libwebkit2gtk-4.1-0, libgtk-3-0 |
| `rpm/Minecrack-1.3.2-1.x86_64.rpm` | 6,0 MB | magic `edabeedb` ✓ |
| `appimage/Minecrack_1.3.2_amd64.AppImage` | 88,9 MB | `--appimage-extract` ✓ — binario ejecutable dentro |

**Ejecución y capturas**: el binario final (`target/release/tauri-app`, el mismo
empaquetado en los 3 formatos) corrió en Xvfb `:99` con el mismo protocolo y la
misma secuencia de clics que la Fase 3 — **8/8 checks PASS a la primera** (sin
reintentos ni esperas por repintado). Las cajas de `00-launch` y
`03-instance-detail` se recalibraron: las originales fallaban incluso sobre las
propias capturas de la Fase 3 (el texto de bienvenida está en y≈540-610, no en
450-500; la fila de pestañas del detalle en (646,397)-(1200,460)). Capturas en
`~/.ui-captures/final-phase5/`; scripts efímeros en `/tmp/opencode/`
(`poll5.py` con los 8 checks, `phase5-capture.sh`, `phase5-checks.py`,
`phase5-diff.py`).

| Captura | vs baseline «antes» (iguales / media) | vs «después» Fase 3 (iguales / media) |
|---|---|---|
| `00-launch` | 97,4 % / 1,58 | 99,9 % / 0,01 |
| `03-instance-detail` | 96,0 % / 2,65 | 99,8 % / 0,06 |
| `04-settings` | 98,3 % / 0,89 | 100,0 % / 0,00 |
| `05-modpack-browser` | 86,6 % / 13,93 | 100,0 % / 0,00 |
| `06-new-instance` | 94,1 % / 2,52 | 99,8 % / 0,07 |
| `07-console-tab` | 96,8 % / 1,88 | 99,8 % / 0,06 |
| `08-add-mod` | 76,1 % / 4,95 | 100,0 % / 0,01 |
| `09-import-instance` | 97,3 % / 0,99 | 99,9 % / 0,02 |

Lectura: contra el baseline el resultado **replica la tabla de la Fase 3**
(desviación ≤0,1 pp en todas las capturas: el renovamiento visual persiste en el
paquete final); contra los «después» de la Fase 3 todo está en **99,8–100 %** → ni
el refactor estructural de la Fase 4 ni el empaquetado cambian ni un píxel visible
(los 0–0,2 % restantes son ruido de render/dinámico: cursor, animaciones).

## Regeneración / automatización (usado en la Fase 5)

- **Display aislado**: capturar siempre en Xvfb `:99` (nunca en el `:0.0` del escritorio
  real): `apt-get download xvfb && dpkg -x` (sin sudo) → `Xvfb :99 -screen 0 1920x1080x24`,
  más `xfwm4 --compositor=off`, `xfsettingsd` y la app con
  `LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1` (evita el fallo DRI3 que
  deja frames congelados). Sin screensaver/locker ni colisión con otras ventanas.
- Clicks X11 con `pyautogui` (venv en `/tmp/opencode/venv-x11`); mapeo de coordenadas
  verificado exacto contra Xlib (`root.query_pointer`). El helper está en
  `/tmp/opencode/x11.py` (recursivo para `wm_name='Minecrack'`, `raise` con
  `_NET_ACTIVE_WINDOW` + `set_input_focus`; el **primer clic tras un `raise` puede
  comerse en el foco** → repetir y verificar).
- `gnome-screenshot` funciona con fallback X11 sin GNOME Shell.
- **El render puede llegar tarde** (hallazgo 4; en Xvfb, decenas de segundos): tras cada
  acción, sondear con checks de píxeles hasta que el frame muestre el estado esperado
  (`/tmp/opencode/poll.py`: caja verde del botón/indicador propio de cada estado) antes
  de dar por buena la captura, y contrastar siempre marcadores de píxeles si la lectura
  de la imagen duda.
