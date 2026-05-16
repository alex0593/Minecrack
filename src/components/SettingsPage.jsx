import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { detectJava, pickFile, pickFolder, getLauncherDir } from '../lib/tauri';
import './SettingsPage.css';

// ─── Color conversion helpers ────────────────────────────────────────────────
function hslToRgb(h, s, l) {
  const c = ((100 - Math.abs(2 * l - 100)) / 100) * (s / 100);
  const h_ = h / 60;
  const x = c * (1 - Math.abs((h_ % 2) - 1));
  let r, g, b;

  if (h_ < 1) { r = c; g = x; b = 0; }
  else if (h_ < 2) { r = x; g = c; b = 0; }
  else if (h_ < 3) { r = 0; g = c; b = x; }
  else if (h_ < 4) { r = 0; g = x; b = c; }
  else if (h_ < 5) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  const m = (l / 100) - (c / 2);
  const toHex = (val) => Math.round((val + m) * 255).toString(16).padStart(2, '0').toUpperCase();

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ─── RGB to HSL conversion ───────────────────────────────────────────────────
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, icon, children }) {
  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <span className="settings-section-icon">{icon}</span>
        <h3 className="settings-section-title">{title}</h3>
      </div>
      <div className="settings-section-body">
        {children}
      </div>
    </div>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────
function Field({ label, hint, children }) {
  return (
    <div className="settings-field">
      <div className="settings-field-label">
        <span>{label}</span>
        {hint && <span className="settings-field-hint">{hint}</span>}
      </div>
      <div className="settings-field-control">
        {children}
      </div>
    </div>
  );
}

// ─── Main SettingsPage ────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { state, dispatch, openModal } = useStore();
  const { config, profile, profileReady } = state;

  // Local copy of config for controlled inputs
  const [javaPath,    setJavaPath]    = useState(config.javaPath    ?? '');
  const [gameDir,     setGameDir]     = useState(config.gameDir     ?? '');
  const [theme,       setTheme]       = useState(config.theme       ?? 'dark');
  const [defaultRam,  setDefaultRam]  = useState(config.defaultRam  ?? 2048);
  const [jvmArgs,     setJvmArgs]     = useState(config.defaultJvmArgs ?? '');
  const [accentColor, setAccentColor] = useState(config.accentColor ?? '#00e676');

  const [javaInfo,    setJavaInfo]    = useState(null);
  const [detecting,   setDetecting]   = useState(false);
  const [saved,       setSaved]       = useState(false);
  const mountedRef = useRef(false);

  // Sync state cuando la config cambia externamente (p.ej. al cargar desde disco)
  useEffect(() => {
    setJavaPath(config.javaPath    ?? '');
    setGameDir( config.gameDir     ?? '');
    setTheme(   config.theme       ?? 'dark');
    setDefaultRam(config.defaultRam  ?? 2048);
    setJvmArgs( config.defaultJvmArgs ?? '');
    setAccentColor(config.accentColor ?? '#00e676');
  }, [config]);

  // Nota: el tema y accent color se aplican globalmente en App.jsx (useThemeSync).
  // Aquí solo persistimos al store para que se guarden en disco.

  // Auto-guardar tema y accent al cambiar (evitar dispatch en el primer render)
  useEffect(() => {
    if (!mountedRef.current) return;
    dispatch({ type: 'UPDATE_CONFIG', payload: { theme } });
  }, [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mountedRef.current) return;
    if (accentColor && /^#[0-9A-F]{6}$/i.test(accentColor)) {
      dispatch({ type: 'UPDATE_CONFIG', payload: { accentColor } });
    }
  }, [accentColor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Marcar como montado tras el primer ciclo
  useEffect(() => { mountedRef.current = true; }, []);

  const save = () => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: {
        javaPath:        javaPath.trim()  || null,
        gameDir:         gameDir.trim()   || null,
        theme,
        defaultRam,
        defaultJvmArgs:  jvmArgs.trim(),
        accentColor,
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDetectJava = async () => {
    setDetecting(true);
    setJavaInfo(null);
    try {
      const launcherDir = await getLauncherDir();
      const installations = await detectJava(launcherDir);
      if (installations?.length > 0) {
        const best = installations.reduce((a, b) =>
          (b.major_version ?? 0) > (a.major_version ?? 0) ? b : a
        );
        setJavaPath(best.path ?? '');
        setJavaInfo({ version: best.version, major: best.major_version });
      } else {
        setJavaInfo({ version: 'No encontrado', major: 0 });
      }
    } catch (err) {
      setJavaInfo({ version: `Error: ${err.message}`, major: 0 });
    } finally {
      setDetecting(false);
    }
  };

  const handlePickJava = async () => {
    const path = await pickFile({
      title: 'Seleccionar ejecutable Java',
      filters: [{ name: 'Java', extensions: ['exe', ''] }],
    });
    if (path) setJavaPath(path);
  };

  const handlePickDir = async () => {
    const path = await pickFolder({ title: 'Seleccionar directorio del launcher' });
    if (path) setGameDir(path);
  };

  const ramLabel = (mb) => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`;
    return `${mb} MB`;
  };

  const themes = [
    { id: 'dark',   icon: '🌙', label: 'Oscuro'   },
    { id: 'light',  icon: '☀️', label: 'Claro'    },
    { id: 'system', icon: '💻', label: 'Sistema'  },
  ];

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <h1 className="settings-page-title">Configuración</h1>
        <p className="settings-page-subtitle">Ajustes globales del launcher</p>
      </div>

      <div className="settings-content">

        {/* ── Profile ───────────────────────────────────────────── */}
        <Section title="Perfil" icon="🎮">
          <Field label="Usuario offline" hint="Nombre que aparece en el juego">
            <div className="settings-profile-row">
              <span className="settings-profile-name">
                {profileReady && profile.username ? profile.username : 'Sin perfil'}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => openModal('profile')}
              >
                ✎ Editar
              </button>
            </div>
          </Field>
        </Section>

        {/* ── Java ─────────────────────────────────────────────── */}
        <Section title="Java" icon="☕">
          <Field
            label="Ruta al ejecutable Java"
            hint="Deja vacío para usar la detección automática"
          >
            <div className="settings-path-row">
              <input
                className="input settings-path-input"
                value={javaPath}
                onChange={e => setJavaPath(e.target.value)}
                placeholder="java  (detectar automáticamente)"
                spellCheck={false}
                autoComplete="off"
              />
              <button
                className="btn btn-ghost btn-sm"
                onClick={handlePickJava}
                title="Examinar..."
              >📁</button>
            </div>
            <div className="settings-path-actions">
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleDetectJava}
                disabled={detecting}
              >
                {detecting ? '⏳ Detectando…' : '🔍 Detectar automáticamente'}
              </button>
              {javaInfo && (
                <span className={`settings-java-info${javaInfo.major >= 17 ? ' ok' : ' warn'}`}>
                  {javaInfo.major >= 17 ? '✓' : '⚠'} {javaInfo.version}
                </span>
              )}
            </div>
          </Field>
        </Section>

        {/* ── Directorio ───────────────────────────────────────── */}
        <Section title="Directorio del launcher" icon="📁">
          <Field
            label="Carpeta de datos"
            hint="Donde se guardan instancias, versiones y mods"
          >
            <div className="settings-path-row">
              <input
                className="input settings-path-input"
                value={gameDir}
                onChange={e => setGameDir(e.target.value)}
                placeholder="Directorio predeterminado"
                spellCheck={false}
                autoComplete="off"
              />
              <button
                className="btn btn-ghost btn-sm"
                onClick={handlePickDir}
                title="Examinar..."
              >📁</button>
            </div>
          </Field>
        </Section>

        {/* ── Apariencia ───────────────────────────────────────── */}
        <Section title="Apariencia" icon="🎨">
          <Field label="Tema de la interfaz" hint="Elige el aspecto general del launcher">
            <div className="settings-theme-pills">
              {themes.map(t => (
                <button
                  key={t.id}
                  className={`settings-theme-pill${theme === t.id ? ' active' : ''}`}
                  onClick={() => setTheme(t.id)}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="Color de acentuación"
            hint="Personaliza el color principal (verde por defecto)"
          >
            <div className="settings-color-section">
              <div className="settings-color-preview" style={{ background: accentColor }} />
              <div className="settings-color-inputs">
                <input
                  type="range"
                  className="settings-color-slider"
                  min="0"
                  max="360"
                  value={hexToHsl(accentColor).h}
                  onChange={(e) => {
                    const hue = parseInt(e.target.value);
                    const rgb = hslToRgb(hue, 100, 50);
                    setAccentColor(rgb);
                  }}
                />
                <div className="settings-color-hex-input">
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>
                    Color HEX
                  </label>
                  <input
                    type="text"
                    value={accentColor}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      // Permitir escribir sin # al inicio
                      let fullHex = val.startsWith('#') ? val : `#${val}`;
                      // Solo actualizar si es válido
                      if (fullHex.length === 7 && /^#[0-9A-Fa-f]{6}$/.test(fullHex)) {
                        setAccentColor(fullHex.toUpperCase());
                      } else if (fullHex.length < 7) {
                        // Permitir que el usuario siga escribiendo
                        // pero solo actualizar si es válido
                        if (/^#[0-9A-Fa-f]*$/.test(fullHex)) {
                          // Input válido, pero incompleto
                        }
                      }
                    }}
                    placeholder="#00e676"
                    maxLength={7}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      padding: '8px 10px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--accent)',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0', lineHeight: 1.5 }}>
                Escribe un valor HEX (ej: #FF5733) o usa el selector para elegir cualquier color. Los cambios se aplican al instante en toda la interfaz.
              </p>
            </div>
          </Field>
        </Section>

        {/* ── Rendimiento ──────────────────────────────────────── */}
        <Section title="Rendimiento" icon="⚡">
          <Field
            label={`RAM por defecto — ${ramLabel(defaultRam)}`}
            hint="Memoria asignada a cada nueva instancia (se puede cambiar por instancia)"
          >
            <div className="settings-ram-row">
              <span className="settings-ram-label">512 MB</span>
              <input
                type="range"
                className="settings-ram-slider"
                min={512}
                max={8192}
                step={512}
                value={defaultRam}
                onChange={e => setDefaultRam(Number(e.target.value))}
              />
              <span className="settings-ram-label">8 GB</span>
            </div>
            <div className="settings-ram-ticks">
              {[512, 1024, 2048, 4096, 6144, 8192].map(v => (
                <button
                  key={v}
                  className={`settings-ram-tick${defaultRam === v ? ' active' : ''}`}
                  onClick={() => setDefaultRam(v)}
                >
                  {ramLabel(v)}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="JVM Args por defecto"
            hint="Argumentos adicionales de la JVM para nuevas instancias"
          >
            <input
              className="input"
              value={jvmArgs}
              onChange={e => setJvmArgs(e.target.value)}
              placeholder="-XX:+UseZGC -Xss1M"
              spellCheck={false}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
              autoComplete="off"
            />
          </Field>
        </Section>

      </div>

      {/* Save bar */}
      <div className="settings-save-bar">
        <span className={`settings-saved-badge${saved ? ' visible' : ''}`}>
          ✓ Guardado
        </span>
        <button
          className="btn btn-primary"
          onClick={save}
          style={{ minWidth: 140 }}
        >
          {saved ? '✓ Guardado' : '💾 Guardar cambios'}
        </button>
      </div>
    </div>
  );
}
