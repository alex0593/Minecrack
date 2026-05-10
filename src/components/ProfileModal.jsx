import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { generateOfflineUUID } from '../lib/instances';
import { pickFile, getLauncherDir, ensureDir, writeFile, readFile } from '../lib/tauri';
import './ProfileModal.css';

// ─── Skin preview 3D simple (canvas 2D art style) ────────────────────────────
function SkinPreview({ skinData, username }) {
  useEffect(() => {
    const canvas = document.getElementById('skin-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Fondo
    ctx.fillStyle = '#1a1e2a';
    ctx.fillRect(0, 0, w, h);

    if (!skinData) {
      // Default: Steve skin pattern
      ctx.fillStyle = '#00e67633';
      ctx.fillRect(w / 4, h / 4, w / 2, h / 2);
      ctx.fillStyle = '#00e676';
      ctx.font = 'bold 14px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('No hay skin', w / 2, h / 2);
      return;
    }

    // Si tenemos datos de imagen, dibujar la skin
    const img = new Image();
    img.onload = () => {
      // Dibujar head de la skin (parte superior izquierda 8x8 de la textura)
      // En una textura de 64x64, la cabeza ocupa de 0-8 x 0-8
      const scale = Math.min(w, h) / 16;
      ctx.drawImage(img, 0, 0, 8, 8, w / 2 - 4 * scale, h / 4, 8 * scale, 8 * scale);
      // Dibujar body (8x12 starting at 16, 16)
      ctx.drawImage(img, 16, 16, 8, 12, w / 2 - 4 * scale, h / 4 + 8 * scale, 8 * scale, 12 * scale);
    };
    img.onerror = () => {
      // Fallback si no carga
      ctx.fillStyle = '#8b92a8';
      ctx.fillRect(w / 3, h / 3, w / 3, h / 3);
    };
    img.src = skinData;
  }, [skinData]);

  return <canvas id="skin-canvas" width={200} height={260} style={{ borderRadius: 'var(--radius-lg)' }} />;
}

// ─── Main Profile Modal ──────────────────────────────────────────────────────
export default function ProfileModal() {
  const { state, dispatch, closeModal } = useStore();
  const [username, setUsername] = useState(state.profile.username || '');
  const [error, setError] = useState('');
  const [skinData, setSkinData] = useState(state.profile.skin || null);
  const [tab, setTab] = useState('general'); // 'general' | 'skin'
  const [loading, setLoading] = useState(false);

  const validate = (val) => {
    if (val.length < 3) return 'El nick debe tener al menos 3 caracteres.';
    if (val.length > 16) return 'El nick no puede superar 16 caracteres.';
    if (!/^[a-zA-Z0-9_]+$/.test(val)) return 'Solo letras, números y guion bajo.';
    return '';
  };

  const handleSave = () => {
    const err = validate(username.trim());
    if (err) {
      setError(err);
      return;
    }
    dispatch({
      type: 'SET_PROFILE',
      payload: {
        username: username.trim(),
        uuid: generateOfflineUUID(username.trim()),
        skin: skinData,
      },
    });
    closeModal();
  };

  const handleSkinUpload = async () => {
    try {
      setLoading(true);
      const pickedPath = await pickFile({
        title: 'Seleccionar archivo de skin',
        filters: [
          { name: 'PNG Images', extensions: ['png'] },
          { name: 'Todos los archivos', extensions: ['*'] },
        ],
      });

      if (!pickedPath) return;

      // Leer el archivo como data URL
      const fileContent = await readFile(pickedPath);
      // En un escenario real, deberías usar FileReader del browser
      // Por ahora, almacenamos una referencia al path
      const launcherDir = await getLauncherDir();
      const skinsDir = `${launcherDir}/skins`;
      await ensureDir(skinsDir);

      // Guardar skin en directorio local
      const skinName = `${username.trim() || 'default'}-${Date.now()}.png`;
      const skinPath = `${skinsDir}/${skinName}`;

      // Simulación: usar el path como skin data
      // En producción, deberías copiar el archivo y usar una URL blob o base64
      setSkinData(pickedPath);
    } catch (err) {
      console.error('[ProfileModal] Error uploading skin:', err);
      setError(`Error cargando skin: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSkin = () => {
    setSkinData(null);
  };

  const uuid = generateOfflineUUID(username.trim());
  const isValidUsername = username.trim().length >= 3 && !validate(username.trim());

  return (
    <div className="overlay" onClick={closeModal}>
      <div className="modal profile-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="profile-modal-header">
          <div className="profile-modal-icon">🎮</div>
          <div>
            <h2 className="profile-modal-title">Perfil Offline</h2>
            <p className="profile-modal-subtitle">
              Personaliza tu jugador sin cuenta de Microsoft
            </p>
          </div>
          <button className="modal-close" onClick={closeModal}>✕</button>
        </div>

        {/* Info badge */}
        <div className="profile-info-badge">
          ⚠ El modo offline no permite jugar en servidores con autenticación activada.
        </div>

        {/* Tabs */}
        <div className="profile-tabs">
          <button
            className={`profile-tab${tab === 'general' ? ' active' : ''}`}
            onClick={() => setTab('general')}
          >
            👤 General
          </button>
          <button
            className={`profile-tab${tab === 'skin' ? ' active' : ''}`}
            onClick={() => setTab('skin')}
          >
            🎨 Skin
          </button>
        </div>

        {/* Tab: General */}
        {tab === 'general' && (
          <div className="profile-tab-content">
            <div className="profile-field">
              <label className="profile-label">Nombre de jugador</label>
              <input
                id="input-username"
                className="input"
                value={username}
                onChange={e => {
                  setUsername(e.target.value);
                  setError('');
                }}
                placeholder="Steve123"
                maxLength={16}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
              {error && <p className="profile-error">{error}</p>}
              <div className="profile-counter">{username.length}/16</div>
            </div>

            {/* UUID Display */}
            <div className="profile-field">
              <label className="profile-label">UUID Offline</label>
              <div className="profile-uuid-box">
                <span className="profile-uuid-icon">🔑</span>
                <div>
                  <div className="profile-uuid-label">UUID v3 (generado automáticamente)</div>
                  <div className="profile-uuid-value">{uuid}</div>
                </div>
              </div>
              <p className="profile-uuid-help">
                Se genera automáticamente a partir de tu nombre de jugador para mantener consistencia entre sesiones.
              </p>
            </div>

            {/* Preview */}
            {isValidUsername && (
              <div className="profile-preview">
                <div className="profile-preview-icon">🪖</div>
                <div className="profile-preview-info">
                  <div className="profile-preview-name">{username.trim()}</div>
                  <div className="profile-preview-status">Listo para jugar</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Skin */}
        {tab === 'skin' && (
          <div className="profile-tab-content">
            <div className="profile-skin-container">
              {/* Preview */}
              <div className="profile-skin-preview-box">
                <SkinPreview skinData={skinData} username={username.trim()} />
              </div>

              {/* Controls */}
              <div className="profile-skin-controls">
                <h3 className="profile-skin-title">Configurar Skin</h3>
                <p className="profile-skin-help">
                  Las skins deben ser archivos PNG de 64x32 o 64x64 píxeles en formato de Minecraft.
                </p>

                {skinData ? (
                  <div className="profile-skin-loaded">
                    <div className="profile-skin-loaded-info">
                      <span className="profile-skin-loaded-icon">✓</span>
                      <span className="profile-skin-loaded-text">Skin cargada</span>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={handleRemoveSkin}
                      style={{ width: '100%' }}
                    >
                      🗑 Eliminar skin
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleSkinUpload}
                      disabled={loading}
                      style={{ width: '100%' }}
                    >
                      {loading ? '⏳ Cargando…' : '🔄 Cambiar skin'}
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={handleSkinUpload}
                    disabled={loading}
                    style={{ width: '100%' }}
                  >
                    {loading ? '⏳ Cargando…' : '📤 Cargar skin'}
                  </button>
                )}

                <div className="profile-skin-presets">
                  <p className="profile-skin-presets-label">Skins por defecto:</p>
                  <div className="profile-skin-preset-buttons">
                    <button
                      className="btn btn-ghost btn-sm profile-preset-btn"
                      onClick={() => setSkinData(null)}
                      title="Steve (skin por defecto)"
                    >
                      🪖 Steve
                    </button>
                    <button
                      className="btn btn-ghost btn-sm profile-preset-btn"
                      title="Alex (skin clásico femenino)"
                    >
                      👩 Alex
                    </button>
                    <button
                      className="btn btn-ghost btn-sm profile-preset-btn"
                      title="Creeper"
                    >
                      💚 Creeper
                    </button>
                    <button
                      className="btn btn-ghost btn-sm profile-preset-btn"
                      title="Enderman"
                    >
                      👤 Enderman
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="profile-modal-actions">
          <button id="btn-cancel-profile" className="btn btn-ghost" onClick={closeModal}>
            Cancelar
          </button>
          <button
            id="btn-save-profile"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={username.trim().length < 3}
          >
            ✓ Guardar perfil
          </button>
        </div>
      </div>
    </div>
  );
}
