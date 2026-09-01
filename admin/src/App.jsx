import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, hasSession, login, logout } from './api';

function Login({ onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await login(username, password);
      onLogin();
    } catch (err) {
      setError(err.message);
    }
  };

  return <main className="login-shell">
    <form className="card login-card" onSubmit={submit}>
      <div className="brand">⛏️ Minecrack</div>
      <h1>Administración</h1>
      <label>Usuario<input value={username} onChange={e => setUsername(e.target.value)} /></label>
      <label>Contraseña<input type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p className="error">{error}</p>}
      <button>Entrar</button>
    </form>
  </main>;
}

function Field({ label, children }) {
  return <label>{label}{children}</label>;
}

function Dashboard({ onLogout }) {
  const [mods, setMods] = useState([]);
  const [versions, setVersions] = useState([]);
  const [packs, setPacks] = useState([]);
  const [releases, setReleases] = useState([]);
  const [selectedPack, setSelectedPack] = useState('');
  const [selectedRelease, setSelectedRelease] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [nextMods, nextVersions, nextPacks] = await Promise.all([
        api('/api/v1/admin/mods'), api('/api/v1/admin/mod-versions'), api('/api/v1/admin/modpacks'),
      ]);
      setMods(nextMods); setVersions(nextVersions); setPacks(nextPacks);
      if (!selectedPack && nextPacks[0]) setSelectedPack(String(nextPacks[0].id));
    } catch (err) { setError(err.message); }
  }, [selectedPack]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!selectedPack) { setReleases([]); return; }
    api(`/api/v1/admin/modpacks/${selectedPack}/releases`)
      .then(items => { setReleases(items); setSelectedRelease(items[0] ? String(items[0].id) : ''); })
      .catch(err => setError(err.message));
  }, [selectedPack]);

  const action = async (fn, message) => {
    setError(''); setNotice('');
    try { await fn(); setNotice(message); await load(); }
    catch (err) { setError(err.message); }
  };

  const createMod = event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    return action(() => api('/api/v1/admin/mods', { method: 'POST', body: JSON.stringify(Object.fromEntries(data)) }), 'Mod creado.');
  };
  const uploadVersion = event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const modId = data.get('modId');
    data.delete('modId');
    const params = new URLSearchParams({
      version: data.get('version'), minecraft_version: data.get('minecraftVersion'), loader: data.get('loader'),
    });
    data.delete('version'); data.delete('minecraftVersion'); data.delete('loader');
    return action(() => api(`/api/v1/admin/mods/${modId}/versions?${params}`, { method: 'POST', body: data }), 'Archivo validado y almacenado.');
  };
  const createPack = event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    return action(() => api('/api/v1/admin/modpacks', { method: 'POST', body: JSON.stringify(data) }), 'Modpack creado.');
  };
  const createRelease = event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    return action(() => api(`/api/v1/admin/modpacks/${selectedPack}/releases`, { method: 'POST', body: JSON.stringify(data) }), 'Borrador creado.');
  };
  const compatibleVersions = useMemo(() => {
    const release = releases.find(item => String(item.id) === selectedRelease);
    return release ? versions.filter(item => item.minecraft_version === release.minecraft_version && item.loader === release.loader) : [];
  }, [releases, selectedRelease, versions]);

  return <div className="shell">
    <header><div className="brand">⛏️ Minecrack Admin</div><button className="ghost" onClick={onLogout}>Cerrar sesión</button></header>
    {(error || notice) && <div className={error ? 'banner error' : 'banner success'}>{error || notice}</div>}
    <section className="grid">
      <form className="card" onSubmit={createMod}><h2>1. Crear mod</h2>
        <Field label="Slug"><input name="slug" required pattern="[a-z0-9][a-z0-9-]+" /></Field>
        <Field label="Nombre"><input name="name" required /></Field>
        <Field label="Autor"><input name="author" /></Field>
        <Field label="URL original"><input name="sourceUrl" type="url" /></Field>
        <Field label="Descripción"><textarea name="description" /></Field><button>Crear mod</button>
      </form>
      <form className="card" onSubmit={uploadVersion}><h2>2. Subir versión</h2>
        <Field label="Mod"><select name="modId" required>{mods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="Versión del mod"><input name="version" required /></Field>
        <Field label="Minecraft"><input name="minecraftVersion" placeholder="1.20.1" required /></Field>
        <Field label="Loader"><select name="loader"><option>fabric</option><option>forge</option><option>quilt</option><option>neoforge</option><option>vanilla</option></select></Field>
        <Field label="JAR"><input name="upload" type="file" accept=".jar" required /></Field><button>Subir y calcular SHA-256</button>
      </form>
      <form className="card" onSubmit={createPack}><h2>3. Crear modpack</h2>
        <Field label="Slug"><input name="slug" required pattern="[a-z0-9][a-z0-9-]+" /></Field>
        <Field label="Nombre"><input name="name" required /></Field>
        <Field label="Descripción"><textarea name="description" /></Field><button>Crear modpack</button>
      </form>
      <form className="card" onSubmit={createRelease}><h2>4. Crear release</h2>
        <Field label="Modpack"><select value={selectedPack} onChange={e => setSelectedPack(e.target.value)}>{packs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Versión"><input name="version" required /></Field>
        <Field label="Minecraft"><input name="minecraftVersion" required /></Field>
        <Field label="Loader"><select name="loader"><option>fabric</option><option>forge</option><option>quilt</option><option>neoforge</option><option>vanilla</option></select></Field>
        <Field label="Changelog"><textarea name="changelog" /></Field><button disabled={!selectedPack}>Crear borrador</button>
      </form>
    </section>
    <section className="card release-card"><h2>5. Componer y publicar</h2>
      <Field label="Release"><select value={selectedRelease} onChange={e => setSelectedRelease(e.target.value)}>{releases.map(r => <option key={r.id} value={r.id}>{r.version_string} · {r.status}</option>)}</select></Field>
      <div className="version-list">{compatibleVersions.map(v => <div key={v.id}><span>{v.file_name}<small>{v.version_string} · {v.sha256.slice(0, 12)}…</small></span><button onClick={() => action(() => api(`/api/v1/admin/releases/${selectedRelease}/files/${v.id}`, { method: 'POST' }), `${v.file_name} añadido.`)}>Añadir</button></div>)}</div>
      <button className="publish" disabled={!selectedRelease} onClick={() => action(() => api(`/api/v1/admin/releases/${selectedRelease}/publish`, { method: 'POST' }), 'Release publicada y activada.')}>Publicar release</button>
    </section>
  </div>;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(hasSession());
  if (!authenticated) return <Login onLogin={() => setAuthenticated(true)} />;
  return <Dashboard onLogout={async () => { await logout(); setAuthenticated(false); }} />;
}

