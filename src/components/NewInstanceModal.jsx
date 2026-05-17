import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { createInstance, POPULAR_VERSIONS, LOADERS } from '../lib/instances';
import { getCompatibleLoaderVersions, getLatestCompatibleVersion, isLoaderAvailable } from '../lib/loaders/versions';
import Select from './ui/Select';

const ICONS = ['🟩','⛏','🌲','🔥','❄️','⚡','🏔','🌊','🐉','💎','🛡','🗡','🧪','🌙','☀️','🎯'];

export default function NewInstanceModal() {
  const { dispatch, closeModal, state } = useStore();
  const prefill = state.modalData?.prefill ?? null;
  const [step, setStep] = useState(1);

  const [name, setName] = useState(prefill?.name ?? '');
  const [icon, setIcon] = useState('⛏');
  const [version, setVersion] = useState(prefill?.version ?? '');
  const [loader, setLoader] = useState(prefill?.loader ?? 'vanilla');
  const [loaderVersion, setLoaderVersion] = useState('latest');
  const [versionMode, setVersionMode] = useState('latest'); // 'latest' o 'specific'

  // Estados de carga de versiones
  const [availableVersions, setAvailableVersions] = useState({});
  const [loadingVersions, setLoadingVersions] = useState({});
  const [loaderCompatibility, setLoaderCompatibility] = useState({});

  // Precargar disponibilidad de loaders cuando llega al paso 2
  useEffect(() => {
    if (step === 2 && version) {
      loadLoaderCompatibility();
    }
  }, [step, version]);

  async function loadLoaderCompatibility() {
    const compat = {};
    setLoadingVersions(LOADERS.reduce((acc, l) => ({ ...acc, [l.id]: true }), {}));

    for (const l of LOADERS) {
      if (l.id === 'vanilla') {
        compat[l.id] = { available: true, versions: [] };
      } else {
        const versions = await getCompatibleLoaderVersions(l.id, version);
        compat[l.id] = { available: versions.length > 0, versions };
      }
    }

    setLoaderCompatibility(compat);
    setLoadingVersions({});
  }

  // Cuando cambia el loader seleccionado, cargar sus versiones específicas
  useEffect(() => {
    if (loader !== 'vanilla' && version) {
      loadVersionsForLoader(loader);
    }
  }, [loader, version]);

  async function loadVersionsForLoader(loaderType) {
    if (loaderType === 'vanilla') return;

    setLoadingVersions(prev => ({ ...prev, [loaderType]: true }));
    const versions = await getCompatibleLoaderVersions(loaderType, version);
    setAvailableVersions(prev => ({ ...prev, [loaderType]: versions }));
    setLoadingVersions(prev => ({ ...prev, [loaderType]: false }));

    // Auto-seleccionar la primera versión estable
    if (versions.length > 0) {
      setVersionMode('latest');
      const latestStable = versions.find(v => v.stable) || versions[0];
      setLoaderVersion(latestStable.version);
    } else {
      setLoaderVersion('');
    }
  }

  const canNext1 = name.trim().length >= 2 && version !== '';
  const canCreate = canNext1 && (loader === 'vanilla' || loaderVersion !== '');

  const handleCreate = () => {
    // loaderVersion ya viene resuelto a versión real (no "latest") por loadVersionsForLoader
    const inst = createInstance({
      name: name.trim(),
      version,
      loader,
      loaderVersion: loader === 'vanilla' ? null : loaderVersion,
      icon,
    });
    dispatch({ type: 'ADD_INSTANCE', payload: inst });
    dispatch({ type: 'SELECT_INSTANCE', payload: inst.id });
    closeModal();
  };

  // Versiones disponibles para el loader seleccionado
  const currentLoaderVersions = useMemo(() => {
    if (loader === 'vanilla') return [];
    return availableVersions[loader] || [];
  }, [loader, availableVersions]);

  return (
    <div className="overlay" onClick={closeModal}>
      <div className="modal modal--md" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2 style={{ color: 'var(--text-primary)' }}>Nueva instancia</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Paso {step} de 2
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={closeModal}>✕</button>
        </div>

        {/* Steps indicator */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {[1,2].map(s => (
            <div key={s} style={{
              flex: 1, height: 3, borderRadius: 99,
              background: s <= step ? 'var(--accent)' : 'var(--border)',
              transition: 'background 0.2s',
            }} />
          ))}
        </div>

        {/* Step 1: Name + Icon + Version */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Icon picker */}
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                Ícono
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ICONS.map(ic => (
                  <button
                    key={ic}
                    className="btn btn-ghost"
                    style={{
                      width: 38, height: 38, padding: 0,
                      fontSize: 18, justifyContent: 'center',
                      borderColor: icon === ic ? 'var(--accent)' : 'var(--border)',
                      background: icon === ic ? 'var(--accent-glow)' : 'transparent',
                    }}
                    onClick={() => setIcon(ic)}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Nombre de la instancia
              </label>
              <input
                id="input-instance-name"
                className="input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Mi Instancia de Fabric"
                autoFocus
                maxLength={40}
                autoComplete="off"
              />
            </div>

            {/* Version */}
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Versión de Minecraft
              </label>
              <Select
                value={version}
                onChange={setVersion}
                placeholder="— Selecciona una versión —"
                searchable
                options={POPULAR_VERSIONS.map(v => ({ value: v, label: v }))}
              />
            </div>
          </div>
        )}

        {/* Step 2: Loader */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Mod loader para <strong style={{ color: 'var(--accent)' }}>MC {version}</strong>
            </p>

            {LOADERS.map(l => {
              const compat = loaderCompatibility[l.id];
              const isAvailable = compat?.available ?? true;
              const isLoading = loadingVersions[l.id];

              return (
                <div key={l.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Loader button */}
                  <button
                    id={`loader-${l.id}`}
                    onClick={() => {
                      if (isAvailable || l.id === 'vanilla') {
                        setLoader(l.id);
                      }
                    }}
                    disabled={!isAvailable && l.id !== 'vanilla'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 16px', borderRadius: 10, cursor: isAvailable || l.id === 'vanilla' ? 'pointer' : 'not-allowed',
                      background: loader === l.id ? 'var(--accent-glow)' : 'var(--bg-elevated)',
                      border: `1px solid ${loader === l.id ? 'var(--border-accent)' : 'var(--border)'}`,
                      opacity: (isAvailable || l.id === 'vanilla') ? 1 : 0.5,
                      transition: 'all 0.15s', width: '100%', textAlign: 'left', position: 'relative',
                    }}
                  >
                    <span style={{ fontSize: 24 }}>
                      {{ vanilla:'🟩', fabric:'🟦', forge:'🟠', quilt:'🟣', neoforge:'🔴' }[l.id]}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
                        {l.label}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {{
                          vanilla:  'Sin mods, juego vanilla puro.',
                          fabric:   'Modloader ligero y moderno.',
                          forge:    'Modloader con mejor compatibilidad.',
                          quilt:    'Fork de Fabric con más características.',
                          neoforge: 'Fork moderno de Forge. Solo MC 1.20.1+.',
                        }[l.id]}
                      </div>
                      {!isAvailable && l.id !== 'vanilla' && (
                        <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 4 }}>
                          ✗ No disponible para MC {version}
                        </div>
                      )}
                    </div>
                    {loader === l.id && (
                      <span style={{ color: 'var(--accent)', fontSize: 18 }}>✓</span>
                    )}
                  </button>

                  {/* Version selector (solo si está seleccionado y disponible) */}
                  {loader === l.id && l.id !== 'vanilla' && isAvailable && (
                    <div style={{
                      marginLeft: 38, display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                      {/* Mode selector */}
                      <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            checked={versionMode === 'latest'}
                            onChange={() => setVersionMode('latest')}
                            style={{ cursor: 'pointer' }}
                          />
                          Más reciente compatible
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            checked={versionMode === 'specific'}
                            onChange={() => setVersionMode('specific')}
                            style={{ cursor: 'pointer' }}
                          />
                          Versión específica
                        </label>
                      </div>

                      {/* Version selector */}
                      {versionMode === 'specific' && (
                        <Select
                          size="sm"
                          value={loaderVersion}
                          onChange={setLoaderVersion}
                          placeholder={isLoading ? 'Cargando versiones…' : '— Selecciona versión —'}
                          disabled={isLoading || currentLoaderVersions.length === 0}
                          searchable
                          options={currentLoaderVersions.map(v => ({
                            value: v.version,
                            label: v.version,
                            badge: v.isLatest ? 'latest' : (!v.stable ? 'beta' : null),
                          }))}
                        />
                      )}

                      {/* Info about selected version */}
                      {versionMode === 'latest' && currentLoaderVersions.length > 0 && (
                        <div style={{
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          padding: '6px 10px',
                          background: 'var(--bg-base)',
                          borderRadius: 4,
                          border: '1px solid var(--border)',
                        }}>
                          📦 {currentLoaderVersions[0]?.version || 'Cargando...'}
                          {currentLoaderVersions[0]?.stable ? ' (estable)' : ' (beta)'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Summary preview */}
        {step === 2 && (
          <div style={{
            marginTop: 16, padding: '12px 14px',
            background: 'var(--bg-base)', borderRadius: 8,
            border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 12, fontSize: 13,
          }}>
            <span style={{ fontSize: 24 }}>{icon}</span>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                MC {version} · {LOADERS.find(l => l.id === loader)?.label}
                {loader !== 'vanilla' && ` (${loaderVersion})`}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          {step === 1 ? (
            <>
              <button id="btn-cancel-new" className="btn btn-ghost" style={{ flex: 1 }} onClick={closeModal}>
                Cancelar
              </button>
              <button
                id="btn-next-step"
                className="btn btn-primary"
                style={{ flex: 2 }}
                onClick={() => setStep(2)}
                disabled={!canNext1}
              >
                Siguiente →
              </button>
            </>
          ) : (
            <>
              <button id="btn-back-step" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setStep(1)}>
                ← Atrás
              </button>
              <button
                id="btn-create-instance"
                className="btn btn-primary"
                style={{ flex: 2 }}
                onClick={handleCreate}
                disabled={!canCreate}
              >
                ✓ Crear instancia
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
