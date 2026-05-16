/**
 * loader-repair.js — Auto-repair para instaladores de loaders (Forge, NeoForge, Fabric, Quilt)
 * Descarga y verifica instaladores de loaders si están faltando
 */

import { tauriCmd, fileExists, downloadFile } from './tauri';
import { getRequiredJavaVersion } from './prism';

/**
 * Extrae la versión real del loader desde el profileId compuesto.
 *
 * El loaderVersion guardado puede ser el profileId completo:
 *   Forge:    "1.19.2-43.5.0"          → versión real "1.19.2-43.5.0" (sin cambio)
 *   NeoForge: "1.20.1-neoforge-47.1.0" → versión real "47.1.0"
 *   Fabric:   "1.20.1-fabric-0.19.2"   → versión real "0.19.2"
 */
export function extractRealVersion(loader, loaderVersion) {
  if (loader === 'neoforge' && loaderVersion.includes('-neoforge-')) {
    return loaderVersion.split('-neoforge-')[1];
  }
  if (loader === 'fabric' && loaderVersion.includes('-fabric-')) {
    return loaderVersion.split('-fabric-')[1];
  }
  if (loader === 'quilt' && loaderVersion.includes('-quilt-')) {
    return loaderVersion.split('-quilt-')[1];
  }
  return loaderVersion; // Forge y casos simples: sin cambio
}

/**
 * Obtiene la URL y hash del instalador de Forge desde Prism Meta
 */
async function getForgeInstallerInfo(version) {
  try {
    const response = await fetch(`https://meta.prismlauncher.org/v1/net.minecraftforge/${version}.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    // Buscar el instalador en mavenFiles
    if (data.mavenFiles && Array.isArray(data.mavenFiles)) {
      for (const mf of data.mavenFiles) {
        const name = mf.name || '';
        if (name.includes('forge') && name.includes('installer')) {
          const artifact = mf.downloads?.artifact;
          if (artifact?.url) {
            return { url: artifact.url, sha1: artifact.sha1 || null, path: artifact.path, name };
          }
        }
      }
    }
    throw new Error('Instalador de Forge no encontrado en Prism Meta');
  } catch (err) {
    console.warn(`[LoaderRepair] No se pudo obtener info de Forge desde Prism Meta: ${err.message}`);
    return null;
  }
}

/**
 * Obtiene la URL y hash del instalador de NeoForge desde Prism Meta
 */
async function getNeoForgeInstallerInfo(neoforgeVersion) {
  try {
    const response = await fetch(`https://meta.prismlauncher.org/v1/net.neoforged/${neoforgeVersion}.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    // Buscar instalador en mavenFiles
    const sections = [...(data.mavenFiles ?? []), ...(data.libraries ?? [])];
    for (const mf of sections) {
      const name = mf.name || '';
      if (name.toLowerCase().includes('neoforge') && name.includes('installer')) {
        const artifact = mf.downloads?.artifact;
        if (artifact?.url) {
          return { url: artifact.url, sha1: artifact.sha1 || null, path: artifact.path, name };
        }
      }
    }
    // Fallback: construir URL directa al Maven de NeoForge
    const jarName = `neoforge-${neoforgeVersion}-installer.jar`;
    const path = `net/neoforged/neoforge/${neoforgeVersion}/${jarName}`;
    return {
      url: `https://maven.neoforged.net/releases/${path}`,
      sha1: null,
      path,
      name: jarName,
    };
  } catch (err) {
    console.warn(`[LoaderRepair] No se pudo obtener info de NeoForge desde Prism Meta: ${err.message}`);
    // Construir URL directa como fallback
    const jarName = `neoforge-${neoforgeVersion}-installer.jar`;
    const path = `net/neoforged/neoforge/${neoforgeVersion}/${jarName}`;
    return {
      url: `https://maven.neoforged.net/releases/${path}`,
      sha1: null,
      path,
      name: jarName,
    };
  }
}

/**
 * Obtiene información del instalador basado en el loader
 */
async function getLoaderInstallerInfo(loader, realVersion) {
  if (loader === 'forge') {
    return await getForgeInstallerInfo(realVersion);
  } else if (loader === 'neoforge') {
    return await getNeoForgeInstallerInfo(realVersion);
  }
  return null;
}

/**
 * Construye la ruta del instalador en el directorio de librerías
 */
function getInstallerPath(launcherDir, loader, loaderVersion) {
  const realVersion = extractRealVersion(loader, loaderVersion);

  if (loader === 'forge') {
    // Forge: libraries/net/minecraftforge/forge/1.19.2-43.5.0/forge-1.19.2-43.5.0-installer.jar
    return `${launcherDir}/libraries/net/minecraftforge/forge/${realVersion}/forge-${realVersion}-installer.jar`;
  } else if (loader === 'neoforge') {
    // NeoForge: libraries/net/neoforged/neoforge/47.1.0/neoforge-47.1.0-installer.jar
    return `${launcherDir}/libraries/net/neoforged/neoforge/${realVersion}/neoforge-${realVersion}-installer.jar`;
  }

  return null;
}

/**
 * Auto-reparación: Descarga instalador faltante del loader
 */
export async function ensureLoaderInstaller(instance, launcherDir, onProgress) {
  if (instance.loader === 'vanilla') {
    return { success: true, installerPath: null }; // Vanilla no necesita instalador
  }

  const installerPath = getInstallerPath(launcherDir, instance.loader, instance.loaderVersion);
  if (!installerPath) {
    console.warn(`[LoaderRepair] No se puede reparar instalador para loader: ${instance.loader}`);
    return { success: false, error: 'Loader no soportado para reparación' };
  }

  // Comprobar si ya existe
  if (await fileExists(installerPath)) {
    console.log(`[LoaderRepair] ✓ Instalador de ${instance.loader} ya existe: ${installerPath}`);
    return { success: true, installerPath };
  }

  console.log(`[LoaderRepair] Instalador faltante, intentando descargar...`);
  onProgress?.({ phase: 'start', label: `Descargando instalador de ${instance.loader}...`, percent: 0 });

  try {
    // Obtener información del instalador (extraer versión real del profileId)
    const realVersion = extractRealVersion(instance.loader, instance.loaderVersion);
    const installerInfo = await getLoaderInstallerInfo(instance.loader, realVersion);
    if (!installerInfo) {
      throw new Error(`No se pudo obtener información del instalador de ${instance.loader}`);
    }

    console.log(`[LoaderRepair] Descargando desde: ${installerInfo.url}`);

    // Descargar el instalador
    await downloadFile(installerInfo.url, installerPath, installerInfo.sha1, `${instance.loader}-installer.jar`);

    console.log(`[LoaderRepair] ✓ Instalador descargado exitosamente: ${installerPath}`);
    onProgress?.({ phase: 'done', label: 'Instalador descargado', percent: 100 });

    return { success: true, installerPath };
  } catch (err) {
    console.error(`[LoaderRepair] ✗ Error descargando instalador: ${err.message}`);
    onProgress?.({ phase: 'error', label: `Error: ${err.message}`, percent: 0 });
    return { success: false, error: err.message, installerPath };
  }
}

/**
 * Obtiene la ruta del instalador (descargando si es necesario)
 */
export async function getLoaderInstallerPath(instance, launcherDir, onProgress) {
  const installerPath = getInstallerPath(launcherDir, instance.loader, instance.loaderVersion);

  if (!installerPath) {
    return null; // Loader no soportado
  }

  // Si ya existe, devolverlo
  if (await fileExists(installerPath)) {
    return installerPath;
  }

  // Si no existe, intentar repararlo
  const result = await ensureLoaderInstaller(instance, launcherDir, onProgress);
  return result.success ? result.installerPath : null;
}

/**
 * Genera un reporte de reparación
 */
export function generateRepairReport(result) {
  if (!result) return '';

  let report = `\n${'='.repeat(60)}\n`;
  report += `Loader Installer Repair Report\n`;
  report += `${'='.repeat(60)}\n`;
  report += `Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}\n`;

  if (result.installerPath) {
    report += `Installer Path: ${result.installerPath}\n`;
  }

  if (result.error) {
    report += `\nError: ${result.error}\n`;
  }

  report += `${'='.repeat(60)}\n`;
  return report;
}

export default {
  ensureLoaderInstaller,
  getLoaderInstallerPath,
  getInstallerPath,
  generateRepairReport,
};
