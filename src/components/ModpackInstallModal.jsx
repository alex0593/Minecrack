/**
 * ModpackInstallModal.jsx — Modal unificado de clonado/instalación de modpacks.
 *
 * Recibe un modpack pre-seleccionado y lo instala como instancia:
 *   - source='curseforge': descarga ZIP via CurseForge API → extract → import → mods
 *   - source='modrinth': descarga .mrpack → extract → crea instancia + mods (parcial)
 *
 * Se invoca desde ModpackBrowser al clic en una card.
 */

import { useEffect, useState } from 'react';
import { useDispatch } from '../store';
import {
  getModpackWithVersions,
  getModpackDownloadUrl,
  isCurseForgeConfigured,
} from '../lib/api/curseforge-modpacks';
import {
  getModpackVersions as getModrinthVersions,
} from '../lib/api/modrinth';
import {
  downloadFile,
  getLauncherDir,
  extractZip,
  inspectInstanceFolder,
  importInstanceFromFolder,
  getModsToDownload,
  removeDir,
} from '../lib/tauri';
import { downloadMultipleModsFromCurseForge } from '../lib/mods/curseforge-downloader';
import ProgressBar from './ui/ProgressBar';
import Modal from './ui/Modal';
import './ModpackDownloadModal.css';

export default function ModpackInstallModal({ source, pack, onClose }) {
  const { dispatch, openModal } = useDispatch();

  const [step, setStep] = useState('loading'); // loading | previewing | downloading | installing-mods | done | error
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState(null);

  const [modsTotal, setModsTotal] = useState(0);
  const [modsDone, setModsDone] = useState(0);
  const [modsFailed, setModsFailed] = useState(0);

  // Normalizar el pack a un shape común
  const display = source === 'curseforge'
    ? {
        name: pack.name,
        author: pack.authors?.[0]?.name ?? '',
        summary: pack.summary,
        logo: pack.logo?.url,
        downloads: pack.downloadCount,
      }
    : {
        name: pack.title,
        author: pack.author,
        summary: pack.description,
        logo: pack.icon_url,
        downloads: pack.downloads,
      };

  // Cargar versiones al abrir
  useEffect(() => {
    (async () => {
      try {
        if (source === 'curseforge') {
          const r = await getModpackWithVersions(pack.id);
          setVersions(r.versions || []);
          setSelectedVersion(r.bestVersion || r.versions?.[0] || null);
        } else {
          const r = await getModrinthVersions(pack.project_id);
          setVersions(r || []);
          setSelectedVersion(r?.[0] || null);
        }
        setStep('previewing');
      } catch (err) {
        console.error('[ModpackInstall] Error cargando versiones:', err);
        setError(err?.message || String(err));
        setStep('error');
      }
    })();
  }, [pack, source]);

  // ─── Instalación CurseForge ────────────────────────────────────────────
  const installCurseForge = async () => {
    setStep('downloading');
    setProgress(0);
    setProgressLabel('Obteniendo URL de descarga…');

    const dir = await getLauncherDir();
    const downloadUrl = await getModpackDownloadUrl(pack.id, selectedVersion.id);

    setProgress(10);
    setProgressLabel(`Descargando ${pack.name}…`);
    const zipPath = `${dir}/modpacks/${pack.slug}-${selectedVersion.id}.zip`;
    await downloadFile(downloadUrl, zipPath, null, 'modpack');

    setProgress(30);
    setProgressLabel('Extrayendo archivos…');
    const tempDir = `${dir}/temp-modpack-${Date.now()}`;
    await extractZip(zipPath, tempDir);

    try {
      setProgress(50);
      setProgressLabel('Importando instancia…');
      const preview = await inspectInstanceFolder(tempDir);
      const importResult = await importInstanceFromFolder(dir, tempDir, pack.name);

      dispatch({
        type: 'ADD_INSTANCE',
        payload: {
          id: importResult.newInstanceId,
          name: pack.name,
          version: preview?.version || '1.20.1',
          loader: preview?.loader || 'forge',
          loaderVersion: importResult.loaderVersion || preview?.loaderVersion || null,
          icon: '📦',
          ram: 2048,
          jvmArgs: '',
          installed: false,
          lastPlayed: null,
          modsCount: preview?.modsCount || 0,
        },
      });

      setProgress(70);
      setProgressLabel('Obteniendo lista de mods…');
      const mods = await getModsToDownload(tempDir);
      const modsCount = mods?.length || 0;
      setModsTotal(modsCount);

      if (modsCount > 0) {
        setStep('installing-mods');
        await downloadMultipleModsFromCurseForge(dir, importResult.newInstanceId, mods, (info) => {
          if (info.status === 'progress') {
            setModsDone(info.downloaded || 0);
            setModsFailed(info.failed || 0);
            setProgress(70 + Math.round((info.done / modsCount) * 28));
            setProgressLabel(`Descargando mod ${info.done}/${modsCount}: ${info.label || ''}`);
          }
        });
      }

      dispatch({ type: 'UPDATE_INSTANCE', payload: { id: importResult.newInstanceId, installed: true } });
    } finally {
      try { await removeDir(tempDir); } catch {}
    }

    setProgress(100);
    setStep('done');
    setTimeout(onClose, 2200);
  };

  // ─── Instalación Modrinth ──────────────────────────────────────────────
  // Por ahora delegamos al flujo existente de "newInstance" con prefill —
  // el soporte nativo de .mrpack requiere parser Rust adicional (modrinth.index.json).
  const installModrinth = () => {
    onClose();
    openModal('newInstance', {
      prefill: {
        name: pack.title,
        version: selectedVersion?.game_versions?.[0],
        loader: selectedVersion?.loaders?.[0] ?? 'fabric',
      },
    });
  };

  const handleInstall = async () => {
    try {
      if (source === 'curseforge') {
        await installCurseForge();
      } else {
        installModrinth();
      }
    } catch (err) {
      console.error('[ModpackInstall] Install error:', err);
      setError(err?.message || String(err));
      setStep('error');
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────

  if (step === 'error') {
    return (
      <Modal
        open
        onClose={onClose}
        title="Error"
        icon="❌"
        contentClassName="modpack-download-modal"
        footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}
      >
        <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--red)', fontSize: 12 }}>{error}</pre>
      </Modal>
    );
  }

  if (step === 'loading') {
    return (
      <Modal
        open
        onClose={onClose}
        showClose={false}
        closeOnOverlay={false}
        contentClassName="modpack-download-modal"
      >
        <div style={{ textAlign: 'center', padding: 'var(--gap-md)' }}>
          <div className="import-spinner" style={{ margin: '0 auto 16px' }} />
          <p>Cargando información del modpack…</p>
        </div>
      </Modal>
    );
  }

  if (step === 'downloading' || step === 'installing-mods' || step === 'done') {
    return (
      <Modal
        open
        onClose={onClose}
        title={step === 'done' ? 'Instalado' : 'Instalando modpack'}
        icon={step === 'done' ? '✓' : '📥'}
        showClose={false}
        closeOnOverlay={false}
        contentClassName="modpack-download-modal"
      >
        {step === 'done' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, color: 'var(--accent)', marginBottom: 12 }}>✓</div>
            <p style={{ fontSize: 14, margin: 0 }}>{display.name}</p>
            {modsDone > 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 8, margin: 0 }}>
                {modsDone} mod{modsDone === 1 ? '' : 's'} descargado{modsDone === 1 ? '' : 's'}
              </p>
            )}
          </div>
        ) : (
          <>
            <ProgressBar value={progress} max={100} label={`${Math.round(progress)}%`} animated style={{ marginBottom: 16 }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>{progressLabel}</p>
            {step === 'installing-mods' && modsTotal > 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 8 }}>
                {modsDone}/{modsTotal}
                {modsFailed > 0 && <span style={{ color: 'var(--red)' }}> ({modsFailed} fallidos)</span>}
              </p>
            )}
          </>
        )}
      </Modal>
    );
  }

  // step === 'previewing' (overlay y × cerraban: closeOnOverlay por defecto)
  return (
    <Modal
      open
      onClose={onClose}
      title={display.name}
      icon="📦"
      contentClassName="modpack-download-modal"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleInstall} disabled={!selectedVersion}>
            {source === 'curseforge' ? '📥 Descargar e instalar' : '⬇ Crear instancia'}
          </button>
        </>
      }
    >
      {display.logo && (
        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <img src={display.logo} alt={display.name} style={{ maxHeight: 120, borderRadius: 4 }} />
        </div>
      )}

      <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-muted)' }}>
        por <strong>{display.author}</strong> · ⬇ {display.downloads?.toLocaleString() || '?'}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{display.summary}</p>

      {source === 'curseforge' && !isCurseForgeConfigured() && (
        <div style={{ background: 'var(--bg-warning)', border: '1px solid var(--text-warning)', padding: 10, borderRadius: 4, marginTop: 12, fontSize: 12, color: 'var(--text-warning)' }}>
          ⚠️ CurseForge API no está configurada (.env)
        </div>
      )}

      {source === 'modrinth' && (
        <div style={{ background: 'var(--bg-elevated)', padding: 10, borderRadius: 4, marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
          ℹ️ Modrinth: por ahora se crea una instancia preconfigurada con MC + loader.
          La importación nativa de .mrpack está en desarrollo.
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Versión</label>
        <select
          className="input"
          value={selectedVersion?.id || ''}
          onChange={e => setSelectedVersion(versions.find(v => v.id === e.target.value))}
          style={{ width: '100%' }}
        >
          {versions.map(v => (
            <option key={v.id} value={v.id}>
              {source === 'curseforge'
                ? `${v.displayName || v.fileName} (${v.gameVersions?.join(', ') || '?'})`
                : `${v.name} (${v.game_versions?.[0] || '?'} · ${v.loaders?.join('/') || '?'})`}
            </option>
          ))}
        </select>
      </div>
    </Modal>
  );
}
