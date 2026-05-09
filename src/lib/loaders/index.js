// loaders/index.js — Orchestrador de instaladores de loaders
import { installFabric } from './fabric';
import { installQuilt } from './quilt';
import { installForge } from './forge';
import { installNeoForge } from './neoforge';

/**
 * Instala un loader específico para una versión de Minecraft
 * @param {string} loader - 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge'
 * @param {string} loaderVersion - Versión del loader (o 'latest')
 * @param {string} gameVersion - Versión del juego (ej: "1.20.1")
 * @param {string} launcherDir - Directorio del launcher
 * @param {object} versionData - Datos de la versión vanilla
 * @returns {Promise<object>} { loaderVersion, profile }
 */
export async function installLoader(loader, loaderVersion, gameVersion, launcherDir, versionData) {
  console.log(`[Loaders] Instalando ${loader} ${loaderVersion} para MC ${gameVersion}`);

  switch (loader) {
    case 'vanilla':
      // Vanilla no requiere instalador
      return { loaderVersion: null, profile: versionData };

    case 'fabric':
      return installFabric(gameVersion, loaderVersion, launcherDir, versionData);

    case 'quilt':
      return installQuilt(gameVersion, loaderVersion, launcherDir, versionData);

    case 'forge':
      return installForge(gameVersion, loaderVersion, launcherDir, versionData);

    case 'neoforge':
      return installNeoForge(gameVersion, loaderVersion, launcherDir, versionData);

    default:
      throw new Error(`Loader desconocido: ${loader}`);
  }
}
