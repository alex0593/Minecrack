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
 * Obtiene la URL de textura de skin desde la session server de Mojang.
 * @param {string} uuid - UUID del jugador (con o sin guiones)
 * @returns {Promise<string>} URL de la imagen PNG de la skin
 */
async function fetchMojangSkinUrl(uuid) {
  const bare = uuid.replace(/-/g, '');
  const res = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${bare}`);
  if (!res.ok) throw new Error(`Mojang session API: HTTP ${res.status}`);
  const data = await res.json();
  const texProp = data.properties?.find(p => p.name === 'textures');
  if (!texProp) throw new Error('No textures property in Mojang profile');
  const decoded = JSON.parse(atob(texProp.value));
  const skinUrl = decoded?.textures?.SKIN?.url;
  if (!skinUrl) throw new Error('No SKIN texture in Mojang profile');
  return skinUrl;
}

/**
 * Aplica la skin del perfil del usuario a la instancia antes del lanzamiento.
 *
 * Pasos:
 *   1. Sin username o sin skin → no-op
 *   2. Vanilla no soportado (CSL requiere loader)
 *   3. Asegurar CSL instalado en mods/
 *   4. Copiar/descargar el PNG al dir que CSL lee: CustomSkinLoader/LocalSkin/skins/{username}.png
 *   5. Escribir el config CustomSkinLoader.json
 *
 * @param {object} instance
 * @param {object} profile  - { username, uuid, skinUUID, skinBase64, skinSource }
 * @param {string} launcherDir
 */
export async function applySkinToInstance(instance, profile, launcherDir) {
  if (!profile?.username?.trim()) return;

  const hasCrafatar = profile.skinSource === 'crafatar' && profile.skinUUID;
  const hasUpload   = profile.skinSource === 'upload'   && profile.skinBase64;
  if (!hasCrafatar && !hasUpload) return;

  if (instance.loader === 'vanilla') {
    console.log('[skin] Instancia vanilla — skin custom no aplicable (requiere CustomSkinLoader)');
    return;
  }

  const cslJar = await ensureCustomSkinLoader(instance, launcherDir);
  if (!cslJar) {
    console.warn('[skin] CustomSkinLoader no disponible — skip de skin');
    return;
  }

  const cslDir  = `${launcherDir}/instances/${instance.id}/CustomSkinLoader`;
  const skinDir = `${cslDir}/LocalSkin/skins`;
  await ensureDir(skinDir);
  const targetPath = `${skinDir}/${profile.username}.png`;

  try {
    if (hasCrafatar) {
      // Evitar re-descargar si ya existe el PNG para este UUID
      const markerPath = `${skinDir}/.skin-${profile.skinUUID}`;
      if (!await fileExists(markerPath)) {
        const skinUrl = await fetchMojangSkinUrl(profile.skinUUID);
        await downloadFile(skinUrl, targetPath, null, 'skin');
        await writeFile(markerPath, profile.skinUUID);
      }
    } else {
      // Upload: skinBase64 es un data URL "data:image/png;base64,..."
      const base64 = profile.skinBase64.startsWith('data:')
        ? profile.skinBase64.split(',')[1]
        : profile.skinBase64;
      await writeFileBase64(targetPath, base64);
    }
  } catch (err) {
    console.warn('[skin] No se pudo escribir skin a CSL:', err.message);
    return;
  }

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
