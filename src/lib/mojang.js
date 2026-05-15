/**
 * mojang.js — Integración con las APIs públicas de Mojang
 *
 * Obtiene el manifest de versiones, los datos de cada versión,
 * los asset indexes y construye las listas de archivos a descargar.
 */
import { API } from '../config';

// ─── Tipos de versión ────────────────────────────────────────────────────────
export const VERSION_TYPES = {
  release:  'release',
  snapshot: 'snapshot',
  old_beta: 'old_beta',
  old_alpha:'old_alpha',
};

// ─── Cache en memoria ────────────────────────────────────────────────────────
let _manifestCache = null;
const _versionCache = new Map();
const _assetCache   = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Obtiene el manifest de versiones (con caché)
// ─────────────────────────────────────────────────────────────────────────────
export async function getVersionManifest() {
  if (_manifestCache) return _manifestCache;

  const res = await fetch(API.MOJANG.VERSION_MANIFEST);
  if (!res.ok) throw new Error(`Error ${res.status} al obtener el manifest de Mojang`);

  _manifestCache = await res.json();
  return _manifestCache;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lista versiones disponibles, opcionalmente filtradas por tipo
// Retorna: [{ id, type, releaseTime, url, sha1 }]
// ─────────────────────────────────────────────────────────────────────────────
export async function listVersions(filter = ['release']) {
  const manifest = await getVersionManifest();
  return manifest.versions.filter(v => filter.includes(v.type));
}

// ─────────────────────────────────────────────────────────────────────────────
// Obtiene los datos completos de una versión específica
// Incluye: libraries, downloads (client), assetIndex, mainClass, arguments
// ─────────────────────────────────────────────────────────────────────────────
export async function getVersionData(versionId) {
  if (_versionCache.has(versionId)) return _versionCache.get(versionId);

  const manifest = await getVersionManifest();
  const entry = manifest.versions.find(v => v.id === versionId);
  if (!entry) throw new Error(`Versión ${versionId} no encontrada en el manifest`);

  const res = await fetch(entry.url);
  if (!res.ok) throw new Error(`Error ${res.status} al obtener datos de versión ${versionId}`);

  const data = await res.json();
  _versionCache.set(versionId, data);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Obtiene el asset index (lista de todos los assets del juego)
// ─────────────────────────────────────────────────────────────────────────────
export async function getAssetIndex(assetIndexInfo) {
  const { id, url } = assetIndexInfo;
  if (_assetCache.has(id)) return _assetCache.get(id);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error ${res.status} al obtener asset index ${id}`);

  const data = await res.json();
  _assetCache.set(id, data);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Construye la lista COMPLETA de archivos a descargar para una versión
// Retorna: [{ url, dest, sha1, size, label }]
// ─────────────────────────────────────────────────────────────────────────────
export async function buildDownloadList(versionId, launcherDir) {
  const versionData = await getVersionData(versionId);
  const tasks = [];

  const versionsDir  = `${launcherDir}/versions/${versionId}`;
  const librariesDir = `${launcherDir}/libraries`;
  const assetsDir    = `${launcherDir}/assets`;

  // 1. client.jar
  const client = versionData.downloads?.client;
  if (client) {
    tasks.push({
      url:   client.url,
      dest:  `${versionsDir}/${versionId}.jar`,
      sha1:  client.sha1,
      size:  client.size,
      label: `client.jar (${versionId})`,
    });
  }

  // 2. JSON de versión (guardarlo localmente)
  tasks.push({
    url:   null,  // se guarda desde memoria, no se descarga
    dest:  `${versionsDir}/${versionId}.json`,
    sha1:  null,
    size:  0,
    label: `${versionId}.json`,
    content: JSON.stringify(versionData, null, 2),
  });

  // 3. Libraries + Natives
  for (const lib of versionData.libraries ?? []) {
    // Verificar reglas (ej: solo Windows, solo Linux)
    if (!isLibraryAllowed(lib)) continue;

    // Native library (LWJGL, etc. para la plataforma)
    const nativeClassifier = getNativeClassifier();
    if (nativeClassifier && lib.downloads?.classifiers?.[nativeClassifier]) {
      const nativeArtifact = lib.downloads.classifiers[nativeClassifier];
      tasks.push({
        url:    nativeArtifact.url,
        dest:   `${librariesDir}/${nativeArtifact.path}`,
        sha1:   nativeArtifact.sha1,
        size:   nativeArtifact.size,
        label:  `${lib.name} (native)`,
        isNative: true,  // Marcar para extracción posterior
        extractTo: `${launcherDir}/instances/{instanceId}/natives`,  // Placeholder
      });
      continue;  // No procesar el JAR si hay native
    }

    // JAR normal
    const artifact = lib.downloads?.artifact;
    if (!artifact) continue;

    tasks.push({
      url:   artifact.url,
      dest:  `${librariesDir}/${artifact.path}`,
      sha1:  artifact.sha1,
      size:  artifact.size,
      label: lib.name,
    });
  }

  // 4. Asset index JSON
  const assetIndexInfo = versionData.assetIndex;
  tasks.push({
    url:   assetIndexInfo.url,
    dest:  `${assetsDir}/indexes/${assetIndexInfo.id}.json`,
    sha1:  assetIndexInfo.sha1,
    size:  assetIndexInfo.size,
    label: `assets/indexes/${assetIndexInfo.id}.json`,
  });

  return { tasks, versionData, assetIndexInfo };
}

// ─────────────────────────────────────────────────────────────────────────────
// Construye la lista de assets individuales (sonidos, texturas, idiomas)
// Son muchos archivos (~3000) así que se descarga por separado
// ─────────────────────────────────────────────────────────────────────────────
export async function buildAssetDownloadList(assetIndexInfo, launcherDir) {
  const index = await getAssetIndex(assetIndexInfo);
  const assetsDir = `${launcherDir}/assets`;
  const tasks = [];

  for (const [name, obj] of Object.entries(index.objects)) {
    const hash    = obj.hash;
    const prefix  = hash.slice(0, 2);
    const url     = `${API.MOJANG.ASSETS_BASE}/${prefix}/${hash}`;
    const dest    = `${assetsDir}/objects/${prefix}/${hash}`;

    tasks.push({
      url,
      dest,
      sha1:  hash,
      size:  obj.size,
      label: name,
    });
  }

  return tasks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Construye el classpath para lanzar el juego
// Devuelve una string separada por ; (Windows) o : (Unix)
// ─────────────────────────────────────────────────────────────────────────────
export function buildClasspath(versionData, launcherDir, versionId) {
  const sep = navigator.platform.includes('Win') ? ';' : ':';
  const librariesDir = `${launcherDir}/libraries`;
  const versionsDir  = `${launcherDir}/versions/${versionId}`;
  const paths = [];

  // Helper: Convertir nombre de librería a path
  // Ej: "org.ow2.asm:asm:9.9" → "org/ow2/asm/asm/9.9/asm-9.9.jar"
  const nameToPath = (name) => {
    const parts = name.split(':');
    if (parts.length !== 3) return null;
    const [group, artifact, version] = parts;
    const groupPath = group.replace(/\./g, '/');
    const jarName = `${artifact}-${version}.jar`;
    return `${groupPath}/${artifact}/${version}/${jarName}`;
  };

  for (const lib of versionData.libraries ?? []) {
    if (!isLibraryAllowed(lib)) continue;

    let libPath = null;

    const artifact = lib.downloads?.artifact;
    if (artifact?.path) {
      libPath = artifact.path;
    } else if (lib.name) {
      // Handles: artifact with url but no path (e.g. Prism ForgeWrapper),
      // or no artifact object at all — derive path from Maven name convention.
      libPath = nameToPath(lib.name);
    }

    if (libPath) {
      paths.push(`${librariesDir}/${libPath}`);
    }
  }

  // client.jar va al final
  paths.push(`${versionsDir}/${versionId}.jar`);
  return paths.join(sep);
}

// ─────────────────────────────────────────────────────────────────────────────
// Construye los argumentos de lanzamiento del juego (modo offline)
// ─────────────────────────────────────────────────────────────────────────────
export function buildGameArgs(versionData, { username, uuid, gameDir, assetsDir, assetIndexId, versionId }) {
  // Versiones modernas usan arguments.game (array con objetos condicionales)
  // Versiones legacy usan minecraftArguments (string)
  const args = [];

  if (versionData.arguments?.game) {
    for (const arg of versionData.arguments.game) {
      if (typeof arg === 'string') {
        args.push(arg);
      }
      // Ignoramos los objetos condicionales (features) por simplicidad
    }
  } else if (versionData.minecraftArguments) {
    args.push(...versionData.minecraftArguments.split(' '));
  }

  // Reemplazar variables template de Mojang
  const vars = {
    '${auth_player_name}': username,
    '${version_name}':     versionId,
    '${game_directory}':   gameDir,
    '${assets_root}':      assetsDir,
    '${assets_index_name}':assetIndexId,
    '${auth_uuid}':        uuid,
    '${auth_access_token}':'0',
    '${user_type}':        'legacy',
    '${version_type}':     'release',
    '${user_properties}':  '{}',
  };

  return args.map(a => {
    let val = a;
    for (const [k, v] of Object.entries(vars)) val = val.replaceAll(k, v);
    return val;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────
function isLibraryAllowed(lib) {
  if (!lib.rules) return true;

  let allowed = false;
  for (const rule of lib.rules) {
    const matches = ruleMatches(rule);
    if (rule.action === 'allow') {
      if (matches) allowed = true;
    } else if (rule.action === 'disallow') {
      if (matches) return false;
    }
  }
  return allowed;
}

function ruleMatches(rule) {
  if (!rule.os) return true;
  const os = rule.os.name;
  const platform = navigator.platform.toLowerCase();
  if (os === 'windows' && platform.includes('win')) return true;
  if (os === 'osx'     && platform.includes('mac')) return true;
  if (os === 'linux'   && platform.includes('lin')) return true;
  return false;
}

/**
 * Obtiene el classifier correcto para natives según la plataforma
 * Ej: "natives-windows", "natives-linux", "natives-macos", "natives-windows-x86"
 */
function getNativeClassifier() {
  const platform = navigator.platform.toLowerCase();
  const arch = navigator.userAgentData?.platform?.includes('64') ? '64' : '32';

  if (platform.includes('win')) {
    // Windows: natives-windows-x64 o natives-windows (legacy)
    return `natives-windows${arch === '64' ? '-x64' : ''}`;
  }
  if (platform.includes('mac')) {
    // macOS: natives-macos, natives-macos-x64, natives-macos-arm64
    if (arch === '64') {
      // Intentar arm64 primero (Apple Silicon), fallback a x64
      return 'natives-macos-arm64';  // O 'natives-macos-x64' como fallback
    }
    return 'natives-macos';
  }
  if (platform.includes('lin')) {
    // Linux: natives-linux, natives-linux-x64
    return `natives-linux${arch === '64' ? '-x64' : ''}`;
  }

  return null;
}
