/**
 * maven-utils.js — Utilidades compartidas para manejo de coordenadas Maven
 * Usadas por todos los loaders (Fabric, Quilt, NeoForge, Forge)
 *
 * IMPORTANTE: Esta es la fuente de verdad para conversión Maven.
 * Cualquier cambio aquí afecta a todos los loaders.
 * Cambios se bloquean por loaders-maven.test.js
 */

/**
 * Convierte un nombre Maven "group:artifact:version[:classifier]"
 * al path relativo dentro de libraries/
 *
 * Ejemplos:
 *   org.lwjgl:lwjgl:3.3.0
 *     → org/lwjgl/lwjgl/3.3.0/lwjgl-3.3.0.jar
 *
 *   net.fabricmc:fabric-loader:0.15.0
 *     → net/fabricmc/fabric-loader/0.15.0/fabric-loader-0.15.0.jar
 *
 *   net.minecraftforge:forge:1.19.2-43.2.14:installer
 *     → net/minecraftforge/forge/1.19.2-43.2.14/forge-1.19.2-43.2.14-installer.jar
 *
 *   org.lwjgl:lwjgl:3.3.0:natives-windows
 *     → org/lwjgl/lwjgl/3.3.0/lwjgl-3.3.0-natives-windows.jar
 *
 * @param {string} name - Coordenada Maven format
 * @returns {string|null} Path relativo, o null si el nombre es inválido (< 3 partes)
 */
export function mavenNameToPath(name) {
  const parts = name.split(':');
  if (parts.length < 3) return null;

  const [group, artifact, version, classifier] = parts;
  const groupPath = group.replace(/\./g, '/');

  const jarName = classifier
    ? `${artifact}-${version}-${classifier}.jar`
    : `${artifact}-${version}.jar`;

  return `${groupPath}/${artifact}/${version}/${jarName}`;
}

/**
 * Normaliza un array de librerías de loader al formato estándar
 * que Rust puede leer: { downloads: { artifact: { path, url, sha1, size } } }
 *
 * Los loaders modernos (Fabric/Quilt) devuelven librerías en dos formatos:
 *   - Antiguo: { downloads: { artifact: { path, url, sha1, size } } }
 *   - Nuevo:   { name, url } ← Rust no puede leer esto
 *
 * Esta función convierte todo al formato antiguo.
 * Las librerías que no se pueden resolver se descartan.
 *
 * @param {Array} libs - Array de librerías (puede venir de Prism Meta, Fabric Meta, etc.)
 * @returns {Array} Librerías normalizadas con downloads.artifact.path garantizado
 */
export function normalizeLoaderLibraries(libs = []) {
  return libs.map(lib => {
    // Ya tiene el formato estándar con downloads.artifact.path → dejar tal cual
    if (lib.downloads?.artifact?.path) return lib;

    // Formato nuevo: { name, url } → convertir
    if (lib.name && lib.url !== undefined) {
      const path = mavenNameToPath(lib.name);
      if (!path) return null;

      const baseUrl = lib.url.endsWith('/') ? lib.url : lib.url + '/';
      return {
        name: lib.name,
        downloads: {
          artifact: {
            path,
            url: baseUrl + path,
            sha1: lib.sha1 || '',
            size: lib.size || 0,
          },
        },
      };
    }

    // No tiene ni path ni name+url → no se puede resolver
    return null;
  }).filter(lib => lib?.downloads?.artifact?.path);
}
