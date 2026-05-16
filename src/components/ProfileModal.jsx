import { useState } from 'react';
import { useStore } from '../store';
import { generateOfflineUUID } from '../lib/instances';
import { pickFile, readFileBase64 } from '../lib/tauri';
import './ProfileModal.css';

const PRESET_SKINS = [
  { label: 'Steve', uuid: '8667ba71-b85a-4004-af54-457a9734eed7' },
  { label: 'Alex',  uuid: 'ec561538-f3fd-461d-aff5-086b22154bce' },
];

function crafatarBody(uuid) {
  return `https://crafatar.com/renders/body/${uuid}?overlay=true&scale=4`;
}
function crafatarBust(uuid) {
  return `https://crafatar.com/renders/bust/${uuid}?overlay=true&scale=3`;
}

export default function ProfileModal() {
  const { state, dispatch, closeModal } = useStore();
  const [username, setUsername]       = useState(state.profile.username || '');
  const [nameError, setNameError]     = useState('');
  const [tab, setTab]                 = useState('general');

  // Skin state
  const [skinUUID,    setSkinUUID]    = useState(state.profile.skinUUID    || null);
  const [skinBase64,  setSkinBase64]  = useState(state.profile.skinBase64  || null);
  const [skinSource,  setSkinSource]  = useState(state.profile.skinSource  || 'none');

  // Search state
  const [searchInput,  setSearchInput]  = useState('');
  const [searching,    setSearching]    = useState(false);
  const [searchError,  setSearchError]  = useState('');
  const [uploading,    setUploading]    = useState(false);

  const validateName = (val) => {
    if (val.length < 3) return 'El nick debe tener al menos 3 caracteres.';
    if (val.length > 16) return 'No puede superar 16 caracteres.';
    if (!/^[a-zA-Z0-9_]+$/.test(val)) return 'Solo letras, números y guion bajo.';
    return '';
  };

  const handleSave = () => {
    const err = validateName(username.trim());
    if (err) { setNameError(err); return; }
    dispatch({
      type: 'SET_PROFILE',
      payload: {
        username:   username.trim(),
        uuid:       generateOfflineUUID(username.trim()),
        skinUUID,
        skinBase64,
        skinSource,
      },
    });
    closeModal();
  };

  const handleSearchSkin = async () => {
    const q = searchInput.trim();
    if (!q) return;
    setSearching(true);
    setSearchError('');
    try {
      const res = await fetch(
        `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(q)}`
      );
      if (res.status === 404) throw new Error(`Jugador "${q}" no encontrado.`);
      if (!res.ok) throw new Error(`Error ${res.status} al buscar jugador.`);
      const data = await res.json();
      // Format: 32 hex chars → 8-4-4-4-12
      const r = data.id;
      const formatted = `${r.slice(0,8)}-${r.slice(8,12)}-${r.slice(12,16)}-${r.slice(16,20)}-${r.slice(20)}`;
      setSkinUUID(formatted);
      setSkinSource('crafatar');
      setSkinBase64(null);
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleUploadSkin = async () => {
    try {
      setUploading(true);
      setSearchError('');
      const path = await pickFile({
        title: 'Seleccionar skin PNG',
        filters: [{ name: 'PNG Images', extensions: ['png'] }],
      });
      if (!path) return;
      const b64 = await readFileBase64(path);
      setSkinBase64(`data:image/png;base64,${b64}`);
      setSkinSource('upload');
      setSkinUUID(null);
    } catch (err) {
      setSearchError(`Error cargando archivo: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handlePreset = (preset) => {
    setSkinUUID(preset.uuid);
    setSkinSource('crafatar');
    setSkinBase64(null);
    setSearchError('');
  };

  const handleRemoveSkin = () => {
    setSkinUUID(null);
    setSkinBase64(null);
    setSkinSource('none');
  };

  const skinPreviewUrl = skinSource === 'crafatar' && skinUUID
    ? crafatarBody(skinUUID)
    : null;

  const offlineUUID  = generateOfflineUUID(username.trim());
  const isNameValid  = !validateName(username.trim());
  const isPreset     = (uuid) => skinUUID === uuid && skinSource === 'crafatar';

  return (
    <div className="overlay" onClick={closeModal}>
      <div className="modal profile-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header ─────────────────────────────────────── */}
        <div className="profile-modal-header">
          <div className="profile-modal-icon">🎮</div>
          <div>
            <h2 className="profile-modal-title">Perfil Offline</h2>
            <p className="profile-modal-subtitle">Personaliza tu jugador sin cuenta de Microsoft</p>
          </div>
          <button className="modal-close" onClick={closeModal}>✕</button>
        </div>

        {/* ── Tabs ───────────────────────────────────────── */}
        <div className="profile-tabs">
          <button
            className={`profile-tab${tab === 'general' ? ' active' : ''}`}
            onClick={() => setTab('general')}
          >👤 General</button>
          <button
            className={`profile-tab${tab === 'skin' ? ' active' : ''}`}
            onClick={() => setTab('skin')}
          >🎨 Skin</button>
        </div>

        {/* ── Tab: General ───────────────────────────────── */}
        {tab === 'general' && (
          <div className="profile-tab-content">
            <div className="profile-general-layout">

              {/* Avatar preview */}
              <div className="profile-avatar-col">
                {skinPreviewUrl ? (
                  <img
                    src={skinPreviewUrl}
                    alt="skin"
                    className="profile-avatar-render"
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                ) : skinBase64 ? (
                  <img
                    src={skinBase64}
                    alt="skin"
                    className="profile-avatar-render profile-avatar-raw"
                  />
                ) : (
                  <div className="profile-avatar-placeholder">🪖</div>
                )}
                <span className="profile-avatar-label">
                  {username.trim() || 'Steve'}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={() => setTab('skin')}
                >
                  Cambiar skin
                </button>
              </div>

              {/* Form */}
              <div className="profile-form-col">
                <div className="profile-field">
                  <label className="profile-label">Nombre de jugador</label>
                  <input
                    className="input"
                    value={username}
                    onChange={e => { setUsername(e.target.value); setNameError(''); }}
                    placeholder="Steve123"
                    maxLength={16}
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    autoComplete="off"
                  />
                  {nameError && <p className="profile-error">{nameError}</p>}
                  <div className="profile-counter">{username.length}/16</div>
                </div>

                <div className="profile-field">
                  <label className="profile-label">UUID Offline</label>
                  <div className="profile-uuid-box">
                    <span className="profile-uuid-icon">🔑</span>
                    <div>
                      <div className="profile-uuid-label">Generado automáticamente desde tu nick</div>
                      <div className="profile-uuid-value">{offlineUUID}</div>
                    </div>
                  </div>
                </div>

                <div className="profile-info-badge" style={{ margin: 0 }}>
                  ⚠ El modo offline no permite jugar en servidores con autenticación activada.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Skin ──────────────────────────────────── */}
        {tab === 'skin' && (
          <div className="profile-tab-content">
            <div className="profile-skin-layout">

              {/* Left: 3D preview */}
              <div className="profile-skin-preview-col">
                {skinPreviewUrl ? (
                  <img
                    src={skinPreviewUrl}
                    alt="Vista previa 3D"
                    className="profile-skin-render"
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                ) : skinBase64 ? (
                  <div className="profile-skin-custom-box">
                    <img src={skinBase64} alt="Skin personalizada" className="profile-skin-texture" />
                    <span className="profile-skin-custom-label">Textura PNG</span>
                  </div>
                ) : (
                  <div className="profile-skin-empty">
                    <span style={{ fontSize: 52 }}>👤</span>
                    <p>Sin skin</p>
                  </div>
                )}

                {skinSource !== 'none' && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleRemoveSkin}
                    style={{ width: '100%', marginTop: 8 }}
                  >🗑 Quitar</button>
                )}
              </div>

              {/* Right: options */}
              <div className="profile-skin-options-col">

                {/* Search by username */}
                <div className="profile-skin-section">
                  <div className="profile-skin-section-label">Buscar por jugador de Minecraft</div>
                  <div className="profile-skin-search-row">
                    <input
                      className="input"
                      placeholder="Nombre de jugador…"
                      value={searchInput}
                      onChange={e => { setSearchInput(e.target.value); setSearchError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleSearchSkin()}
                      style={{ flex: 1 }}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleSearchSkin}
                      disabled={searching || !searchInput.trim()}
                      style={{ flexShrink: 0 }}
                    >
                      {searching ? '⏳' : '🔍 Buscar'}
                    </button>
                  </div>
                  {searchError && <p className="profile-error" style={{ margin: 0 }}>{searchError}</p>}
                  {skinSource === 'crafatar' && skinUUID && !PRESET_SKINS.find(p => p.uuid === skinUUID) && (
                    <div className="profile-skin-loaded-badge">✓ Skin de Minecraft cargada</div>
                  )}
                </div>

                {/* Presets */}
                <div className="profile-skin-section">
                  <div className="profile-skin-section-label">Skins predeterminadas</div>
                  <div className="profile-skin-presets-row">
                    {PRESET_SKINS.map(preset => (
                      <button
                        key={preset.uuid}
                        className={`profile-preset-card${isPreset(preset.uuid) ? ' active' : ''}`}
                        onClick={() => handlePreset(preset)}
                      >
                        <img
                          src={crafatarBust(preset.uuid)}
                          alt={preset.label}
                          className="profile-preset-render"
                          onError={e => { e.target.style.display = 'none'; }}
                        />
                        <span className="profile-preset-name">{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* File upload */}
                <div className="profile-skin-section">
                  <div className="profile-skin-section-label">Skin personalizada</div>
                  <p className="profile-skin-help">
                    Archivo PNG de 64×64 en formato Minecraft estándar.
                  </p>
                  <button
                    className="btn btn-ghost"
                    onClick={handleUploadSkin}
                    disabled={uploading}
                    style={{ width: '100%' }}
                  >
                    {uploading ? '⏳ Cargando…' : '📤 Cargar archivo PNG'}
                  </button>
                </div>

                {/* Aviso sobre aplicación en-game */}
                <div className="profile-info-badge" style={{ marginTop: 4 }}>
                  ℹ️ Las skins custom se aplican automáticamente al juego solo en
                  instancias <strong>Fabric / Forge / Quilt / NeoForge</strong> vía
                  CustomSkinLoader (se instala solo). En instancias <em>vanilla</em>
                  la skin se muestra solo aquí, no en-game.
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ── Actions ────────────────────────────────────── */}
        <div className="profile-modal-actions">
          <button className="btn btn-ghost" onClick={closeModal}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!isNameValid}
          >
            ✓ Guardar perfil
          </button>
        </div>

      </div>
    </div>
  );
}
