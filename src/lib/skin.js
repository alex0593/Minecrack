/**
 * skin.js — Aplicación de skins custom en instancias modded vía CustomSkinLoader
 *
 * En modo offline vanilla, Minecraft NO soporta skins custom directamente — el
 * cliente intenta consultar el servidor de Mojang con el UUID online del usuario,
 * que en offline mode no devuelve ninguna skin asociada.
 *
 * Solución: auto-instalar el mod CustomSkinLoader (CSL) en instancias modded
 * (Fabric/Forge/Quilt/NeoForge) y configurarlo para que lea el PNG local del
 * perfil del usuario. CSL intercepta las llamadas al SkinManager de Minecraft
 * y sirve la skin desde disco.
 *
 * Mod: https://modrinth.com/mod/customskinloader
 */

import { searchMods, getProjectVersions } from './api/modrinth';
import { ensureDir, fileExists, writeFile, writeFileBase64, copyFile, downloadFile } from './tauri';

const CSL_SLUG = 'customskinloader';

/**
 * Descarga CustomSkinLoader compatible con el loader+MC version de la instancia
 * si no está ya presente en mods/.
 *
 * @returns {Promise<string|null>} ruta del JAR instalado, o null si no se pudo
 */
export async function ensureCustomSkinLoader(instance, launcherDir) {
  if (instance.loader === 'vanilla') return null;

  const modsDir = `${launcherDir}/instances/${instance.id}/mods`;
  await ensureDir(modsDir);

  // Si ya hay un JAR de CSL, no descargar de nuevo
  // (No tenemos list_files en JS — usamos un marcador alternativo via fileExists con un nombre canónico)
  const markerPath = `${modsDir}/.customskinloader-installed`;
  if (await fileExists(markerPath)) {
    return markerPath;
  }

  try {
    // 1. Buscar el proyecto en Modrinth
    const search = await searchMods({
      query: 'CustomSkinLoader',
      gameVersion: instance.version,
      loader: instance.loader,
      limit: 5,
    });

    const project = search?.hits?.find(h => h.slug === CSL_SLUG || h.title?.toLowerCase().includes('customskinloader'));
    if (!project) {
      console.warn('[skin] CustomSkinLoader no encontrado en Modrinth para', instance.loader, instance.version);
      return null;
    }

    // 2. Obtener una versión compatible
    const versions = await getProjectVersions(project.project_id, {
      gameVersion: instance.version,
      loader: instance.loader,
    });
    if (!versions || versions.length === 0) {
      console.warn('[skin] No hay versiones compatibles de CSL para', instance.loader, instance.version);
      return null;
    }

    const latest = versions[0];
    const file = latest.files?.find(f => f.primary) || latest.files?.[0];
    if (!file?.url) {
      console.warn('[skin] CSL version sin archivo descargable');
      return null;
    }

    // 3. Descargar el JAR a mods/
    const jarDest = `${modsDir}/${file.filename}`;
    console.log(`[skin] Descargando CustomSkinLoader: ${file.filename}`);
    await downloadFile(file.url, jarDest, file.hashes?.sha1 ?? null, 'CustomSkinLoader');

    // 4. Crear marcador para no re-descargar
    await writeFile(markerPath, JSON.stringify({ filename: file.filename, version: latest.version_number }));

    return jarDest;
  } catch (err) {
    console.warn('[skin] Error instalando CustomSkinLoader:', err.message);
    return null;
  }
}

/**
 * Aplica la skin del perfil del usuario a la instancia antes del lanzamiento.
 *
 * Pasos:
 *   1. Si no hay skin → no-op
 *   2. Si la instancia es vanilla → log + no-op (CSL no funciona sin loader)
 *   3. Asegurar CSL instalado en mods/
 *   4. Copiar el PNG al directorio que CSL lee: CustomSkinLoader/LocalSkin/skins/{username}.png
 *   5. Escribir el config CustomSkinLoader.json con el loadlist apropiado
 *
 * @param {object} instance
 * @param {object} profile  - { username, uuid, skin (path|base64), skinSource }
 * @param {string} launcherDir
 */
export async function applySkinToInstance(instance, profile, launcherDir) {
  // 1. Sin skin → nada que hacer
  if (!profile?.skin || profile.skinSource === 'crafatar') return;
  if (!profile.username?.trim()) return;

  // 2. Vanilla no soportado por este enfoque
  if (instance.loader === 'vanilla') {
    console.log('[skin] Instancia vanilla — skin custom no aplicable (requiere CustomSkinLoader)');
    return;
  }

  // 3. Asegurar CSL en mods/
  const cslJar = await ensureCustomSkinLoader(instance, launcherDir);
  if (!cslJar) {
    console.warn('[skin] CustomSkinLoader no disponible — skip de skin');
    return;
  }

  // 4. Copiar/escribir el PNG al directorio que CSL lee
  const cslDir = `${launcherDir}/instances/${instance.id}/CustomSkinLoader`;
  const skinDir = `${cslDir}/LocalSkin/skins`;
  await ensureDir(skinDir);
  const targetPath = `${skinDir}/${profile.username}.png`;

  try {
    if (typeof profile.skin === 'string' && profile.skin.startsWith('data:image')) {
      // data URL → escribir como binario
      const base64 = profile.skin.split(',')[1];
      await writeFileBase64(targetPath, base64);
    } else if (typeof profile.skin === 'string' && profile.skin.match(/^[A-Za-z0-9+/=]+$/)) {
      // base64 sin prefijo
      await writeFileBase64(targetPath, profile.skin);
    } else {
      // ruta de archivo → copiar
      await copyFile(profile.skin, targetPath);
    }
  } catch (err) {
    console.warn('[skin] No se pudo escribir skin a CSL:', err.message);
    return;
  }

  // 5. Escribir config (siempre, idempotente)
  const config = {
    enable: true,
    enableSkull: true,
    enableTransparentSkin: true,
    loadlist: [
      { name: 'LocalSkin', type: 'Legacy', checkRoot: '%%username%%' }
    ],
    cacheExpiry: 60,
  };
  await writeFile(`${cslDir}/CustomSkinLoader.json`, JSON.stringify(config, null, 2));

  console.log(`[skin] Skin aplicada para ${profile.username} en instancia ${instance.id}`);
}
