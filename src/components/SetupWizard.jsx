import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { generateOfflineUUID } from '../lib/instances';
import { getLauncherDir, detectJava } from '../lib/tauri';
import { open } from '@tauri-apps/plugin-dialog';
import './SetupWizard.css';

const STEPS = [
  { num: 1, title: 'Bienvenida', icon: '🎮' },
  { num: 2, title: 'Ubicación', icon: '📁' },
  { num: 3, title: 'Java', icon: '☕' },
  { num: 4, title: 'Perfil', icon: '👤' },
  { num: 5, title: 'Listo', icon: '🚀' },
];

export default function SetupWizard() {
  const { state, dispatch } = useStore();
  const [step, setStep] = useState(1);
  const [nickname, setNickname] = useState('');
  const [gameDir, setGameDir] = useState('');
  const [javaInstalls, setJavaInstalls] = useState([]);
  const [javaLoading, setJavaLoading] = useState(false);
  const [selectedJava, setSelectedJava] = useState(null);

  // Cargar el directorio por defecto al iniciar
  useEffect(() => {
    (async () => {
      try {
        const defaultDir = await getLauncherDir();
        setGameDir(defaultDir);
      } catch (e) {
        setGameDir('C:\\Minecrack');
      }
    })();
  }, []);

  const nextStep = () => setStep(Math.min(step + 1, 5));
  const prevStep = () => setStep(Math.max(step - 1, 1));

  const handlePickDir = async () => {
    try {
      let selected;
      if (window.__TAURI_INTERNALS__) {
        selected = await open({
          directory: true,
          multiple: false,
          defaultPath: gameDir,
        });
      } else {
        console.warn('[SetupWizard] Usando selector de carpeta simulado');
        selected = prompt('Ingresa la ruta de la carpeta:', gameDir);
      }
      if (selected) setGameDir(selected);
    } catch (err) {
      console.error('Error abriendo selector:', err);
    }
  };

  const handleDetectJava = async () => {
    setJavaLoading(true);
    try {
      const installs = await detectJava();
      setJavaInstalls(installs);
      if (installs.length > 0) {
        setSelectedJava(installs[0]);
      }
    } catch (err) {
      console.error('Error detectando Java:', err);
    } finally {
      setJavaLoading(false);
    }
  };

  useEffect(() => {
    if (step === 3) {
      handleDetectJava();
    }
  }, [step]);

  const handleFinish = () => {
    if (nickname.trim()) {
      const uuid = generateOfflineUUID(nickname.trim());
      dispatch({ type: 'SET_PROFILE', payload: { username: nickname.trim(), uuid } });
    }

    dispatch({
      type: 'UPDATE_CONFIG',
      payload: {
        setupCompleted: true,
        gameDir: gameDir,
        javaPath: selectedJava?.path || null,
      }
    });

    dispatch({ type: 'SET_SHOW_WIZARD', payload: false });
  };

  const nicknameValid = nickname.trim().length >= 3;
  const currentStepNum = step;

  return (
    <div className="setup-wizard-overlay">
      <div className="setup-wizard-container">
        {/* Decorative glow */}
        <div className="setup-wizard-glow" />

        {/* Header con indicador de progreso */}
        <div className="setup-wizard-header">
          <div className="setup-wizard-progress-indicators">
            {STEPS.map((s) => (
              <div key={s.num} className="setup-wizard-step-indicator">
                <div
                  className={`setup-wizard-step-dot ${
                    s.num === currentStepNum ? 'active' : ''
                  } ${s.num < currentStepNum ? 'completed' : ''}`}
                >
                  {s.num < currentStepNum ? '✓' : s.icon}
                </div>
                <span className="setup-wizard-step-label">{s.title}</span>
              </div>
            ))}
          </div>
          <div className="setup-wizard-step-counter">
            Paso <span className="setup-wizard-counter-num">{currentStepNum}</span> de 5
          </div>
        </div>

        {/* Progress bar */}
        <div className="setup-wizard-progress-bar">
          <div
            className="setup-wizard-progress-fill"
            style={{ width: `${(currentStepNum / 5) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="setup-wizard-content">
          {step === 1 && (
            <div className="setup-wizard-step-content setup-wizard-step-welcome">
              <div className="setup-wizard-step-icon">🎮</div>
              <h1 className="setup-wizard-title">
                ¡Bienvenido a <span className="setup-wizard-accent">Minecrack</span>!
              </h1>
              <p className="setup-wizard-description">
                Estás a solo unos pasos de comenzar tu aventura. Vamos a configurar lo básico para que todo funcione a la perfección.
              </p>
              <div className="setup-wizard-features">
                <div className="setup-wizard-feature">✓ Configuración rápida</div>
                <div className="setup-wizard-feature">✓ Soporte para múltiples loaders</div>
                <div className="setup-wizard-feature">✓ Gestión de mods integrada</div>
              </div>
              <button className="btn btn-primary setup-wizard-cta" onClick={nextStep}>
                Comenzar configuración →
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="setup-wizard-step-content">
              <h2 className="setup-wizard-step-title">¿Dónde guardamos todo?</h2>
              <p className="setup-wizard-step-description">
                Minecrack guardará tus instancias, mods y capturas en esta carpeta. Puedes cambiarla en cualquier momento desde Configuración.
              </p>

              <div className="setup-wizard-field">
                <label className="setup-wizard-field-label">Directorio de datos</label>
                <div className="setup-wizard-input-group">
                  <input
                    type="text"
                    className="input"
                    value={gameDir}
                    onChange={(e) => setGameDir(e.target.value)}
                    autoComplete="off"
                  />
                  <button className="btn btn-ghost" onClick={handlePickDir}>
                    📁 Examinar
                  </button>
                </div>
                <div className="setup-wizard-field-hint setup-wizard-field-hint-success">
                  ℹ️ Recomendamos usar la ruta por defecto para evitar problemas de permisos.
                </div>
              </div>

              <div className="setup-wizard-actions">
                <button className="btn btn-ghost" onClick={prevStep}>← Atrás</button>
                <button className="btn btn-primary" onClick={nextStep}>
                  Siguiente →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="setup-wizard-step-content">
              <h2 className="setup-wizard-step-title">Entorno Java</h2>
              <p className="setup-wizard-step-description">
                Minecraft necesita Java para ejecutarse. Buscamos en tu sistema y encontramos {javaInstalls.length} instalación{javaInstalls.length !== 1 ? 'es' : ''}.
              </p>

              <div className="setup-wizard-java-list">
                {javaLoading ? (
                  <div className="setup-wizard-loading">
                    <div className="setup-wizard-spinner" />
                    <span>Buscando instalaciones de Java...</span>
                  </div>
                ) : javaInstalls.length > 0 ? (
                  javaInstalls.map((j) => (
                    <button
                      key={j.path}
                      onClick={() => setSelectedJava(j)}
                      className={`setup-wizard-java-option ${
                        selectedJava?.path === j.path ? 'active' : ''
                      }`}
                    >
                      <span className="setup-wizard-java-icon">☕</span>
                      <div className="setup-wizard-java-info">
                        <div className="setup-wizard-java-version">
                          Java {j.major_version}
                          {selectedJava?.path === j.path && (
                            <span className="setup-wizard-java-badge">Seleccionado</span>
                          )}
                        </div>
                        <div className="setup-wizard-java-path">{j.path}</div>
                      </div>
                      {selectedJava?.path === j.path && (
                        <span className="setup-wizard-java-check">✓</span>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="setup-wizard-java-empty">
                    <div className="setup-wizard-java-empty-icon">⚠️</div>
                    <h3 className="setup-wizard-java-empty-title">
                      No se encontró Java en tu sistema
                    </h3>
                    <p className="setup-wizard-java-empty-desc">
                      No te preocupes. Podrás descargarlo automáticamente al lanzar Minecraft desde el launcher. También puedes instalarlo manualmente desde <a href="https://www.oracle.com/java/technologies/downloads/" target="_blank" rel="noopener noreferrer" className="setup-wizard-link">oracle.com</a>.
                    </p>
                  </div>
                )}
              </div>

              <div className="setup-wizard-actions">
                <button className="btn btn-ghost" onClick={prevStep}>← Atrás</button>
                <button className="btn btn-primary" onClick={nextStep} disabled={javaLoading}>
                  Siguiente →
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="setup-wizard-step-content">
              <h2 className="setup-wizard-step-title">Tu identidad</h2>
              <p className="setup-wizard-step-description">
                ¿Cómo quieres que te llamen en el juego? (Modo Offline sin autenticación)
              </p>

              <div className="setup-wizard-field">
                <label className="setup-wizard-field-label">Nombre de usuario</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Ejemplo: Steve_Pro"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={16}
                  autoFocus
                  autoComplete="off"
                />
                <div className={`setup-wizard-field-hint ${nicknameValid ? 'setup-wizard-field-hint-success' : 'setup-wizard-field-hint-error'}`}>
                  {nickname.length === 0
                    ? '⌚ Mínimo 3 caracteres requerido'
                    : nickname.trim().length < 3
                    ? `⌚ ${3 - nickname.trim().length} caracteres más`
                    : '✓ Nombre válido'}
                </div>
              </div>

              <div className="setup-wizard-actions">
                <button className="btn btn-ghost" onClick={prevStep}>← Atrás</button>
                <button
                  className="btn btn-primary"
                  onClick={nextStep}
                  disabled={!nicknameValid}
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="setup-wizard-step-content setup-wizard-step-summary">
              <div className="setup-wizard-step-icon setup-wizard-step-icon-large">🚀</div>
              <h2 className="setup-wizard-step-title">¡Todo listo!</h2>
              <p className="setup-wizard-step-description">
                Hemos configurado Minecrack con tus preferencias. Ahora estás listo para jugar.
              </p>

              <div className="setup-wizard-summary-cards">
                <div className="setup-wizard-summary-card">
                  <div className="setup-wizard-summary-icon">👤</div>
                  <div className="setup-wizard-summary-info">
                    <div className="setup-wizard-summary-label">Perfil</div>
                    <div className="setup-wizard-summary-value">{nickname}</div>
                  </div>
                </div>

                <div className="setup-wizard-summary-card">
                  <div className="setup-wizard-summary-icon">📁</div>
                  <div className="setup-wizard-summary-info">
                    <div className="setup-wizard-summary-label">Carpeta de datos</div>
                    <div className="setup-wizard-summary-value setup-wizard-summary-path">{gameDir}</div>
                  </div>
                </div>

                <div className="setup-wizard-summary-card">
                  <div className="setup-wizard-summary-icon">☕</div>
                  <div className="setup-wizard-summary-info">
                    <div className="setup-wizard-summary-label">Entorno Java</div>
                    <div className="setup-wizard-summary-value">
                      {selectedJava ? `Java ${selectedJava.major_version}` : 'Detección Automática'}
                    </div>
                  </div>
                </div>
              </div>

              <button className="btn btn-primary setup-wizard-cta" onClick={handleFinish}>
                ¡Entrar al Launcher! →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
