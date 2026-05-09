/**
 * metadata.js — Estructura normalizada de metadatos de mods
 *
 * Convierte las respuestas de Modrinth y CurseForge a un formato unificado
 * que el sistema de validación y resolución de dependencias puede consumir.
 */

/**
 * @typedef {Object} NormalizedMod
 * @property {string}   id           - ID único del proyecto (slug o ID string)
 * @property {string}   source       - "modrinth" | "curseforge"
 * @property {string}   name
 * @property {string}   versionId    - ID de la versión específica
 * @property {string}   versionName  - Ej: "0.5.3+1.20.1"
 * @property {string}   fileName     - Nombre del archivo JAR
 * @property {string}   downloadUrl
 * @property {string|null} sha1
 * @property {number}   fileSize     - Bytes
 * @property {string[]} gameVersions - MC versions soportadas por esta versión del mod
 * @property {string[]} loaders      - Loaders soportados (minúsculas)
 * @property {string|null} minJava   - Ej: "17", "21" (null = no declarado)
 * @property {ModDependency[]} dependencies
 * @property {string}   description
 * @property {string}   author
 * @property {string|null} iconUrl
 */

/**
 * @typedef {Object} ModDependency
 * @property {string}   projectId  - ID del proyecto dependencia
 * @property {string|null} versionId - Versión específica (null = última compatible)
 * @property {"required"|"optional"|"embedded"|"incompatible"} type
 */

// ─── Normalización desde Modrinth ─────────────────────────────────────────────

/**
 * Convierte una versión de Modrinth + info del proyecto a NormalizedMod
 * @param {object} version  - Objeto de /version/{id} o /project/{id}/version
 * @param {object} [project] - Objeto de /project/{id} (opcional, para nombre/autor/icono)
 * @returns {NormalizedMod}
 */
export function normalizeModrinthVersion(version, project = null) {
  const primaryFile = version.files?.find(f => f.primary) ?? version.files?.[0] ?? null;

  const dependencies = (version.dependencies ?? []).map(dep => ({
    projectId: dep.project_id,
    versionId: dep.version_id ?? null,
    type:      mapModrinthDepType(dep.dependency_type),
  }));

  return {
    id:          project?.slug ?? version.project_id,
    source:      'modrinth',
    name:        project?.title ?? version.name,
    versionId:   version.id,
    versionName: version.version_number,
    fileName:    primaryFile?.filename ?? `${version.project_id}-${version.version_number}.jar`,
    downloadUrl: primaryFile?.url ?? '',
    sha1:        primaryFile?.hashes?.sha1 ?? null,
    fileSize:    primaryFile?.size ?? 0,
    gameVersions: version.game_versions ?? [],
    loaders:     (version.loaders ?? []).map(l => l.toLowerCase()),
    minJava:     extractJavaVersion(version.game_versions ?? []),
    dependencies,
    description: project?.description ?? '',
    author:      project?.team ?? '',
    iconUrl:     project?.icon_url ?? null,
  };
}

function mapModrinthDepType(type) {
  switch (type) {
    case 'required':     return 'required';
    case 'optional':     return 'optional';
    case 'embedded':     return 'embedded';
    case 'incompatible': return 'incompatible';
    default:             return 'optional';
  }
}

// ─── Normalización desde CurseForge ───────────────────────────────────────────

/**
 * Convierte un mod + file de CurseForge a NormalizedMod
 * @param {object} mod  - Objeto de /mods/{id}
 * @param {object} file - Archivo específico (de /mods/{id}/files)
 * @returns {NormalizedMod}
 */
export function normalizeCurseForgeFile(mod, file) {
  const loaders = extractCFLoaders(file);
  const gameVersions = (file.gameVersions ?? []).filter(v => /^\d+\.\d+/.test(v));

  const dependencies = (file.dependencies ?? []).map(dep => ({
    projectId: String(dep.modId),
    versionId: null,
    type:      mapCFDepType(dep.relationType),
  }));

  return {
    id:          mod.slug ?? String(mod.id),
    source:      'curseforge',
    name:        mod.name,
    versionId:   String(file.id),
    versionName: file.displayName ?? file.fileName,
    fileName:    file.fileName,
    downloadUrl: file.downloadUrl ?? '',
    sha1:        extractCFSha1(file),
    fileSize:    file.fileLength ?? 0,
    gameVersions,
    loaders,
    minJava:     extractCFJava(file),
    dependencies,
    description: mod.summary ?? '',
    author:      mod.authors?.[0]?.name ?? '',
    iconUrl:     mod.logo?.url ?? null,
  };
}

function mapCFDepType(relationType) {
  // CurseForge relation types: 1=EmbeddedLibrary, 2=OptionalDependency, 3=RequiredDependency,
  // 4=Tool, 5=Incompatible, 6=Include
  switch (relationType) {
    case 3: return 'required';
    case 2: return 'optional';
    case 1: return 'embedded';
    case 5: return 'incompatible';
    default: return 'optional';
  }
}

function extractCFLoaders(file) {
  const loaders = [];
  for (const gv of file.gameVersions ?? []) {
    const lower = gv.toLowerCase();
    if (['fabric', 'forge', 'quilt', 'neoforge'].includes(lower)) {
      loaders.push(lower);
    }
  }
  return loaders;
}

function extractCFSha1(file) {
  const hash = (file.hashes ?? []).find(h => h.algo === 1); // 1 = SHA1
  return hash?.value ?? null;
}

function extractCFJava(file) {
  // CurseForge a veces incluye "Java 17" en gameVersions
  for (const gv of file.gameVersions ?? []) {
    const match = gv.match(/^Java\s*(\d+)/i);
    if (match) return match[1];
  }
  return null;
}

// ─── Helper compartido ────────────────────────────────────────────────────────

/**
 * Intenta extraer versión mínima de Java de los gameVersions de Modrinth
 * que a veces incluyen "java:17" como categoria
 */
function extractJavaVersion(gameVersions) {
  for (const v of gameVersions) {
    const match = v.match(/^java:?(\d+)/i);
    if (match) return match[1];
  }
  return null;
}
