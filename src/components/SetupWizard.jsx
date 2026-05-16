import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { generateOfflineUUID } from '../lib/instances';
import { getLauncherDir, detectJava } from '../lib/tauri';
import { open } from '@tauri-apps/plugin-dialog';

export default function SetupWizard() {
  const { state, dispatch } = useStore();
  const [step, setStep] = useState(1);
  const [nickname, setNickname] = useState('');
  const [gameDir, setGameDir] = useState('');

  // Estados de Java
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
        setGameDir('C:\\Minecrack'); // Fallback razonable en Windows
      }
    })();
  }, []);

  const nextStep = () => setStep(step + 1);
  const prevStep = () => setStep(step - 1);

  const handlePickDir = async () => {
    try {
      // Intentar usar el plugin nativo, si falla (browser), usar el mock de tauri.js o un fallback
      let selected;
      if (window.__TAURI_INTERNALS__) {
        selected = await open({
          directory: true,
          multiple: false,
          defaultPath: gameDir,
        });
      } else {
        console.warn('[SetupWizard] Usando selector de carpeta simulado (entorno web)');
        selected = prompt('Ingresa la ruta de la carpeta (Simulación):', gameDir);
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
        // Seleccionar el primero por defecto (generalmente el más nuevo)
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
    // 1. Crear perfil inicial
    if (nickname.trim()) {
      const uuid = generateOfflineUUID(nickname.trim());
      dispatch({ type: 'SET_PROFILE', payload: { username: nickname.trim(), uuid } });
    }

    // 2. Marcar setup como completado y guardar config
    dispatch({ 
      type: 'UPDATE_CONFIG', 
      payload: { 
        setupCompleted: true,
        gameDir: gameDir,
        javaPath: selectedJava?.path || null,
      } 
    });

    // 3. Ocultar wizard
    dispatch({ type: 'SET_SHOW_WIZARD', payload: false });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--bg-base)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000, color: 'var(--text-primary)',
      fontFamily: 'var(--font-sans)',
    }}>
      <div style={{
        width: '100%', maxWidth: 500,
        padding: 40, background: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative background glow */}
        <div style={{
          position: 'absolute', top: -100, right: -100,
          width: 200, height: 200, background: 'var(--accent)',
          filter: 'blur(100px)', opacity: 0.1, pointerEvents: 'none',
        }} />

        {/* Step Content */}
        <div style={{ position: 'relative' }}>
          {step === 1 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 64, marginBottom: 20 }}>🎮</div>
              <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 12, letterSpacing: '-0.5px' }}>
                ¡Bienvenido a <span style={{ color: 'var(--accent)' }}>Minecrack</span>!
              </h1>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 32 }}>
                Estás a unos pasos de comenzar tu aventura. Vamos a configurar lo básico para que todo funcione a la perfección.
              </p>
              <button className="btn btn-primary" style={{ width: '100%', padding: '14px 0' }} onClick={nextStep}>
                Comenzar configuración →
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>¿Dónde guardamos todo?</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
                Minecrack guardará tus instancias, mods y capturas en esta carpeta.
              </p>
              
              <div style={{ marginBottom: 32 }}>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                  Directorio de datos
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    className="input"
                    value={gameDir}
                    onChange={(e) => setGameDir(e.target.value)}
                    style={{ fontSize: 13, padding: '12px 14px', flex: 1 }}
                    autoComplete="off"
                  />
                  <button className="btn btn-ghost" onClick={handlePickDir}>
                    📁 Examinar...
                  </button>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                  Recomendamos usar la ruta por defecto para evitar problemas de permisos.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={prevStep}>Atrás</button>
                <button 
                  className="btn btn-primary" 
                  style={{ flex: 2 }} 
                  onClick={nextStep}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Entorno Java</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
                Minecraft necesita Java para ejecutarse. Hemos buscado en tu sistema:
              </p>
              
              <div style={{ marginBottom: 32, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {javaLoading ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                    Buscando instalaciones...
                  </div>
                ) : javaInstalls.length > 0 ? (
                  javaInstalls.map(j => (
                    <button
                      key={j.path}
                      onClick={() => setSelectedJava(j)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                        background: selectedJava?.path === j.path ? 'var(--accent-glow)' : 'var(--bg-base)',
                        border: `1px solid ${selectedJava?.path === j.path ? 'var(--accent)' : 'var(--border)'}`,
                        textAlign: 'left', width: '100%', transition: 'all 0.2s',
                      }}
                    >
                      <span style={{ fontSize: 20 }}>☕</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                          Java {j.major_version}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
                          {j.path}
                        </div>
                      </div>
                      {selectedJava?.path === j.path && <span style={{ color: 'var(--accent)' }}>✓</span>}
                    </button>
                  ))
                ) : (
                  <div style={{ 
                    padding: 20, textAlign: 'center', background: 'var(--bg-base)', 
                    borderRadius: 10, border: '1px dashed var(--red)', color: 'var(--red)' 
                  }}>
                    No se encontró Java en tu sistema.
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                      Podrás descargarlo automáticamente más tarde desde el launcher.
                    </p>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={prevStep}>Atrás</button>
                <button 
                  className="btn btn-primary" 
                  style={{ flex: 2 }} 
                  onClick={nextStep}
                  disabled={javaLoading}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Tu identidad</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
                ¿Cómo quieres que te llamen en el juego? (Modo Offline)
              </p>
              
              <div style={{ marginBottom: 32 }}>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                  Nombre de usuario
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="Ej: Steve_Pro"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  autoFocus
                  style={{ fontSize: 16, padding: '14px 16px' }}
                  autoComplete="off"
                />
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={prevStep}>Atrás</button>
                <button 
                  className="btn btn-primary" 
                  style={{ flex: 2 }} 
                  disabled={nickname.trim().length < 3}
                  onClick={nextStep}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🚀</div>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>¡Todo listo!</h2>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 32 }}>
                Minecrack ya está configurado. Hemos detectado tu entorno y estamos listos para lanzar Minecraft.
              </p>
              
              <div style={{ 
                background: 'var(--bg-base)', padding: 20, borderRadius: 12, 
                textAlign: 'left', marginBottom: 32, border: '1px solid var(--border)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Perfil:</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{nickname}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Carpeta:</span>
                  <span style={{ fontSize: 11, fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{gameDir}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Java:</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {selectedJava ? `Java ${selectedJava.major_version} ✓` : 'Detección Automática ✓'}
                  </span>
                </div>
              </div>

              <button className="btn btn-primary" style={{ width: '100%', padding: '14px 0' }} onClick={handleFinish}>
                ¡Entrar al Launcher!
              </button>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ 
          position: 'absolute', bottom: 0, left: 0, right: 0, 
          height: 4, background: 'var(--bg-base)' 
        }}>
          <div style={{ 
            height: '100%', background: 'var(--accent)', 
            width: `${(step / 5) * 100}%`, transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' 
          }} />
        </div>
      </div>
    </div>
  );
}
