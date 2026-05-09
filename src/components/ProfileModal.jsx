import { useState } from 'react';
import { useStore } from '../store';
import { generateOfflineUUID } from '../lib/instances';

export default function ProfileModal() {
  const { state, dispatch, closeModal } = useStore();
  const [username, setUsername] = useState(state.profile.username || '');
  const [error, setError] = useState('');

  const validate = (val) => {
    if (val.length < 3) return 'El nick debe tener al menos 3 caracteres.';
    if (val.length > 16) return 'El nick no puede superar 16 caracteres.';
    if (!/^[a-zA-Z0-9_]+$/.test(val)) return 'Solo letras, números y guion bajo.';
    return '';
  };

  const handleSave = () => {
    const err = validate(username.trim());
    if (err) { setError(err); return; }
    dispatch({
      type: 'SET_PROFILE',
      payload: {
        username: username.trim(),
        uuid: generateOfflineUUID(username.trim()),
      },
    });
    closeModal();
  };

  return (
    <div className="overlay" onClick={closeModal}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: 'var(--accent-glow)',
            border: '1px solid var(--border-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22,
          }}>🎮</div>
          <div>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: 2 }}>Perfil Offline</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Sin cuenta de Microsoft requerida
            </p>
          </div>
        </div>

        {/* Info badge */}
        <div style={{
          background: 'rgba(255,183,77,0.08)',
          border: '1px solid rgba(255,183,77,0.2)',
          borderRadius: 8, padding: '10px 14px',
          marginBottom: 20, fontSize: 12,
          color: 'var(--amber)', lineHeight: 1.6,
        }}>
          ⚠ El modo offline no permite jugar en servidores con autenticación activada.
        </div>

        {/* Input */}
        <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
          Nombre de jugador
        </label>
        <input
          id="input-username"
          className="input"
          value={username}
          onChange={e => { setUsername(e.target.value); setError(''); }}
          placeholder="Steve123"
          maxLength={16}
          autoFocus
          onKeyDown={e => e.key === 'Enter' && handleSave()}
        />
        {error && (
          <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{error}</p>
        )}

        {/* Preview */}
        {username.trim().length >= 3 && !validate(username.trim()) && (
          <div style={{
            marginTop: 12, padding: '10px 14px',
            background: 'var(--bg-base)', borderRadius: 8,
            border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 13,
          }}>
            <span style={{ fontSize: 22 }}>🪖</span>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {username.trim()}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {generateOfflineUUID(username.trim())}
              </div>
            </div>
          </div>
        )}

        {/* Counter */}
        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          {username.length}/16
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button id="btn-cancel-profile" className="btn btn-ghost" style={{ flex: 1 }} onClick={closeModal}>
            Cancelar
          </button>
          <button
            id="btn-save-profile"
            className="btn btn-primary"
            style={{ flex: 2 }}
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
