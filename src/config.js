/**
 * config.js — Configuración centralizada del launcher
 *
 * Todas las URLs, keys y constantes vienen de variables de entorno (.env).
 * Importa este módulo en lugar de usar import.meta.env directamente,
 * así tienes autocompletado y un solo punto de cambio.
 *
 * Uso:
 *   import { API, LAUNCHER } from '../config';
 *   fetch(API.MOJANG.VERSION_MANIFEST)
 */

// ─── APIs externas ────────────────────────────────────────────────────────────

export const API = {

  /** Mojang — versiones del juego y assets */
  MOJANG: {
    VERSION_MANIFEST: import.meta.env.VITE_MOJANG_VERSION_MANIFEST,
    ASSETS_BASE:      import.meta.env.VITE_MOJANG_ASSETS_BASE,
    LIBRARIES_BASE:   import.meta.env.VITE_MOJANG_LIBRARIES_BASE,
  },

  /**
   * Prism Launcher Meta API — fuente de datos consolidada para versiones de loaders.
   * Provee: Forge, NeoForge, Fabric, Quilt, requisitos de Java por MC version, LWJGL.
   * Docs: https://github.com/PrismLauncher/meta-launcher
   */
  PRISM: {
    BASE: import.meta.env.VITE_PRISM_META_BASE || 'https://meta.prismlauncher.org/v1',
    /** Índice de todas las versiones de Minecraft */
    mcIndex:          () => `${import.meta.env.VITE_PRISM_META_BASE || 'https://meta.prismlauncher.org/v1'}/net.minecraft/index.json`,
    /** Datos completos de una versión MC específica (includes requiresJava) */
    mcVersion:        (version) => `${import.meta.env.VITE_PRISM_META_BASE || 'https://meta.prismlauncher.org/v1'}/net.minecraft/${version}.json`,
    /** Índice de versiones de Forge */
    forgeIndex:       () => `${import.meta.env.VITE_PRISM_META_BASE || 'https://meta.prismlauncher.org/v1'}/net.minecraftforge/index.json`,
    /** Datos de una versión Forge específica (includes libraries con URLs y SHA1) */
    forgeVersion:     (forgeVer) => `${import.meta.env.VITE_PRISM_META_BASE || 'https://meta.prismlauncher.org/v1'}/net.minecraftforge/${forgeVer}.json`,
    /** Índice de versiones de NeoForge */
    neoforgeIndex:    () => `${import.meta.env.VITE_PRISM_META_BASE || 'https://meta.prismlauncher.org/v1'}/net.neoforged/index.json`,
    /** Índice de versiones de Fabric Loader */
    fabricIndex:      () => `${import.meta.env.VITE_PRISM_META_BASE || 'https://meta.prismlauncher.org/v1'}/net.fabricmc.fabric-loader/index.json`,
    /** Índice de versiones de Quilt Loader */
    quiltIndex:       () => `${import.meta.env.VITE_PRISM_META_BASE || 'https://meta.prismlauncher.org/v1'}/org.quiltmc.quilt-loader/index.json`,
  },

  /** Fabric mod loader */
  FABRIC: {
    META:            import.meta.env.VITE_FABRIC_META_BASE,
    MAVEN:           import.meta.env.VITE_FABRIC_MAVEN_BASE,
    /** Versiones del loader para una versión de MC */
    loaderVersions:  (mcVersion) =>
      `${import.meta.env.VITE_FABRIC_META_BASE}/versions/loader/${mcVersion}`,
    /** Perfil de lanzamiento listo para usar */
    launchProfile:   (mcVersion, loaderVersion) =>
      `${import.meta.env.VITE_FABRIC_META_BASE}/versions/loader/${mcVersion}/${loaderVersion}/profile/json`,
  },

  /** Quilt mod loader */
  QUILT: {
    META:            import.meta.env.VITE_QUILT_META_BASE,
    MAVEN:           import.meta.env.VITE_QUILT_MAVEN_BASE,
    loaderVersions:  (mcVersion) =>
      `${import.meta.env.VITE_QUILT_META_BASE}/versions/loader/${mcVersion}`,
    launchProfile:   (mcVersion, loaderVersion) =>
      `${import.meta.env.VITE_QUILT_META_BASE}/versions/loader/${mcVersion}/${loaderVersion}/profile/json`,
  },

  /** Forge — Maven */
  FORGE: {
    MAVEN_BASE:      import.meta.env.VITE_FORGE_MAVEN_BASE,
    FILES_BASE:      import.meta.env.VITE_FORGE_FILES_BASE,
    /** URL del installer de Forge para una versión específica */
    installer:       (mcVersion, forgeVersion) =>
      `${import.meta.env.VITE_FORGE_MAVEN_BASE}/net/minecraftforge/forge/${mcVersion}-${forgeVersion}/forge-${mcVersion}-${forgeVersion}-installer.jar`,
  },

  /** NeoForge — Maven */
  NEOFORGE: {
    MAVEN_BASE: 'https://maven.neoforged.net/releases',
    /** URL del installer de NeoForge para una versión específica */
    installer: (neoforgeVersion) =>
      `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoforgeVersion}/neoforge-${neoforgeVersion}-installer.jar`,
  },

  /** Modrinth — catálogo de mods (sin key o con PAT) */
  MODRINTH: {
    BASE:     import.meta.env.VITE_MODRINTH_API_BASE,
    API_KEY:  import.meta.env.VITE_MODRINTH_API_KEY || null,

    search:        (query, params = '') =>
      `${import.meta.env.VITE_MODRINTH_API_BASE}/search?query=${encodeURIComponent(query)}&${params}`,
    project:       (id) =>
      `${import.meta.env.VITE_MODRINTH_API_BASE}/project/${id}`,
    versions:      (id) =>
      `${import.meta.env.VITE_MODRINTH_API_BASE}/project/${id}/version`,
    version:       (id) =>
      `${import.meta.env.VITE_MODRINTH_API_BASE}/version/${id}`,

    /** Headers listos para usar en fetch() */
    headers: () => ({
      'User-Agent': 'Minecrack/1.0.0 (launcher)',
      ...(import.meta.env.VITE_MODRINTH_API_KEY
        ? { Authorization: import.meta.env.VITE_MODRINTH_API_KEY }
        : {}),
    }),
  },

  /** CurseForge — requiere API key gratuita */
  CURSEFORGE: {
    BASE:    import.meta.env.VITE_CURSEFORGE_API_BASE,
    API_KEY: import.meta.env.VITE_CURSEFORGE_API_KEY || null,

    // Endpoint base de búsqueda. El caller construye el query string completo
    // (un único URLSearchParams con gameId incluido) y lo añade con `?`.
    search:   () =>
      `${import.meta.env.VITE_CURSEFORGE_API_BASE}/mods/search`,
    mod:      (id) =>
      `${import.meta.env.VITE_CURSEFORGE_API_BASE}/mods/${id}`,
    files:    (modId) =>
      `${import.meta.env.VITE_CURSEFORGE_API_BASE}/mods/${modId}/files`,
    file:     (modId, fileId) =>
      `${import.meta.env.VITE_CURSEFORGE_API_BASE}/mods/${modId}/files/${fileId}`,
    downloadUrl: (modId, fileId) =>
      `${import.meta.env.VITE_CURSEFORGE_API_BASE}/mods/${modId}/files/${fileId}/download-url`,

    headers: () => ({
      'x-api-key': import.meta.env.VITE_CURSEFORGE_API_KEY,
      'Content-Type': 'application/json',
    }),

    /** ¿Está configurada la key? */
    isConfigured: () =>
      Boolean(import.meta.env.VITE_CURSEFORGE_API_KEY) &&
      !import.meta.env.VITE_CURSEFORGE_API_KEY.startsWith('$2a$10$xxx'),
  },

  /** Adoptium — descarga automática de JRE */
  ADOPTIUM: {
    BASE: import.meta.env.VITE_ADOPTIUM_API_BASE,
    /** Último JRE LTS para la plataforma actual */
    latestRelease: (version, os, arch) =>
      `${import.meta.env.VITE_ADOPTIUM_API_BASE}/assets/latest/${version}/hotspot?os=${os}&architecture=${arch}&image_type=jre`,
  },
};

// ─── Configuración del launcher ───────────────────────────────────────────────

export const LAUNCHER = {
  /** RAM por defecto (MB) para nuevas instancias */
  DEFAULT_RAM: Number(import.meta.env.VITE_DEFAULT_RAM) || 2048,

  /** Máx. descargas en paralelo */
  MAX_CONCURRENT_DOWNLOADS: Number(import.meta.env.VITE_MAX_CONCURRENT_DOWNLOADS) || 4,

  /** Nombre del directorio de instancias */
  INSTANCES_DIR: import.meta.env.VITE_INSTANCES_DIR_NAME || 'instances',

  /** Versión mínima de Java requerida */
  MIN_JAVA_VERSION: Number(import.meta.env.VITE_MIN_JAVA_VERSION) || 17,

  /** Versión del launcher */
  VERSION: '1.0.0',
};

// ─── Helpers de diagnóstico ───────────────────────────────────────────────────

/**
 * Verifica qué APIs están correctamente configuradas.
 * Útil para mostrar advertencias en la UI de configuración.
 */
export function checkApiStatus() {
  return {
    modrinth:   { available: true,  needsKey: false, hasKey: Boolean(API.MODRINTH.API_KEY) },
    curseforge: { available: API.CURSEFORGE.isConfigured(), needsKey: true,  hasKey: API.CURSEFORGE.isConfigured() },
    mojang:     { available: true,  needsKey: false, hasKey: false },
    fabric:     { available: true,  needsKey: false, hasKey: false },
    forge:      { available: true,  needsKey: false, hasKey: false },
    quilt:      { available: true,  needsKey: false, hasKey: false },
    neoforge:   { available: true,  needsKey: false, hasKey: false },
    adoptium:   { available: true,  needsKey: false, hasKey: false },
  };
}
