// launcher.js — Optimized game launch (Rust-delegated heavy computation)
// Migration: All heavy processing moved to Rust prepare_game_launch command
// JavaScript now handles only orchestration, UI updates, and event listening

import { tauriCmd, tauriListen, ensureDir, readFile, writeFile, fileExists } from './tauri';
import { getRequiredJavaVersion } from './prism';
import { installLoader } from './loaders';
import { downloadQueue } from './downloader';
import { LAUNCHER } from '../config';
import { applySkinToInstance } from './skin';
import { validateJavaInstallation, autoRepairJava } from './java-repair';
import { validateMinecraftJar, autoRepairMinecraftJar } from './minecraft-jar-repair';
import { getLoaderInstallerPath } from './loader-repair';

// ─── Java session cache (P1.3 optimization) ───────────────────────────────────
// Memoize resolved Java path per major version for the duration of the session.
// Re-scan only if unset or validation fails (double-validation in java-repair is intentional).
const _javaCacheByVersion = {};

function getLoaderProfileId(instance) {
  const { loader, loaderVersion, version } = instance;
  if (!loaderVersion || loader === 'vanilla') return null;

  // New format: loaderVersion already IS the full profileId (contains loader name embedded)
  // E.g., "1.20.1-fabric-0.19.2", "1.20.1-neoforge-47.1.106" — use as-is to avoid double prefix
  if (loader === 'fabric'   && loaderVersion.includes('-fabric-'))   return loaderVersion;
  if (loader === 'quilt'    && loaderVersion.includes('-quilt-'))     return loaderVersion;
  if (loader === 'neoforge' && loaderVersion.includes('-neoforge-')) return loaderVersion;

  // Legacy/bare format — build the profileId from parts
  if (loader === 'fabric')   return `${version}-fabric-${loaderVersion}`;
  if (loader === 'quilt')    return `${version}-quilt-${loaderVersion}`;
  if (loader === 'neoforge') return `${version}-neoforge-${loaderVersion}`;
  if (loader === 'forge')    return loaderVersion; // Forge: loaderVersion IS the profileId (e.g., "1.19.2-43.5.0")
  return null;
}

/**
 * Auto-repair legacy Forge/NeoForge profiles (without formatVersion: 2)
 */
async function ensureLoaderProfileUpToDate(instance, launcherDir, versionData, onRepairProgress) {
  if (instance.loader !== 'forge' && instance.loader !== 'neoforge') return false;
  const profileId = getLoaderProfileId(instance);
  if (!profileId) return false;

  const profilePath = `${launcherDir}/versions/${profileId}/${profileId}.json`;
  let needsRepair = false;
  let reason = '';

  if (!(await fileExists(profilePath))) {
    needsRepair = true;
    reason = 'perfil no encontrado';
  } else {
    try {
      const existing = JSON.parse(await readFile(profilePath));
      if (!existing.formatVersion || existing.formatVersion < 2) {
        needsRepair = true;
        reason = `formatVersion=${existing.formatVersion ?? 'undefined'} (legacy)`;
      } else {
        // Detectar perfil ForgeWrapper sin mavenFiles: el installer no puede ejecutarse sin ellos.
        // Ocurre cuando el perfil fue generado por una versión anterior del launcher (sin soporte mavenFiles).
        const isForgeWrapper = existing.mainClass?.toLowerCase().includes('forgewrapper');
        if (isForgeWrapper && !(existing.mavenFiles?.length > 0)) {
          needsRepair = true;
          reason = 'ForgeWrapper detectado pero mavenFiles ausentes';
        }
      }
    } catch (err) {
      needsRepair = true;
      reason = `perfil ilegible: ${err.message}`;
    }
  }

  if (!needsRepair) return false;

  console.log(`[Launcher] Auto-reparación de ${instance.loader}: ${reason}`);
  onRepairProgress?.({ phase: 'start', label: `Reparando instalación de ${instance.loader}…`, percent: 0 });

  // Extract the bare loader version from the composite profileId so installLoader
  // can query Prism Meta correctly. E.g., "1.20.1-neoforge-47.1.106" → "47.1.106"
  const { extractRealVersion } = await import('./loader-repair.js');
  const realLoaderVersion = extractRealVersion(instance.loader, instance.loaderVersion);
  console.log(`[Launcher] Reparando ${instance.loader} con versión real: ${realLoaderVersion} (desde "${instance.loaderVersion}")`);

  const result = await installLoader(
    instance.loader,
    realLoaderVersion,
    instance.version,
    launcherDir,
    versionData,
  );

  if (result.downloadTasks?.length > 0) {
    onRepairProgress?.({ phase: 'download', label: `Descargando ${result.downloadTasks.length} archivos…`, percent: 5 });
    await new Promise((resolve, reject) => {
      const q = downloadQueue({
        tasks: result.downloadTasks,
        concurrency: LAUNCHER.MAX_CONCURRENT_DOWNLOADS,
        onProgress: (p) => {
          const pct = 5 + Math.round((p.done / p.total) * 90);
          onRepairProgress?.({ phase: 'download', label: p.label, percent: pct, done: p.done, total: p.total });
        },
        onDone: ({ failed }) => {
          if (failed > 0) reject(new Error(`${failed} archivos fallaron al descargar`));
          else resolve();
        },
      });
      q.run();
    });
  }

  onRepairProgress?.({ phase: 'done', label: 'Reparación completada', percent: 100 });
  console.log(`[Launcher] Auto-reparación completada: ${result.downloadTasks?.length ?? 0} archivos descargados`);
  return true;
}

/**
 * MAIN GAME LAUNCH — Optimized with Rust delegation
 *
 * Flow:
 * 1. Pre-flight checks: Java validation/repair, Minecraft JAR repair
 * 2. Ensure loader profiles are up-to-date
 * 3. Apply skins (best-effort)
 * 4. Delegate heavy preparation to Rust (prepare_game_launch command)
 * 5. Launch game with the returned LaunchConfig
 * 6. Listen for game events
 */
export async function launchGameInstance({ instance, profile, launcherDir, versionData, onJavaProgress, onRepairProgress }) {
  try {
    console.log(`[Launcher] ========== INICIANDO LANZAMIENTO ==========`);
    console.log(`[Launcher] Instancia: ${instance.id} (${instance.version})`);
    console.log(`[Launcher] Loader: ${instance.loader}${instance.loaderVersion ? ` v${instance.loaderVersion}` : ''}`);

    // ─────────────────────────────────────────────────────────────────────────
    // FASE 1: Validar y reparar Java (crítico — no se puede lanzar sin él)
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`[Launcher] FASE 1: Validación de Java...`);
    const prismJava = await getRequiredJavaVersion(instance.version).catch(() => null);
    const requiredMajor = prismJava ?? versionData?.javaVersion?.majorVersion ?? 17;
    console.log(`[Launcher] Java requerido: ${requiredMajor}`);

    // ─── Session cache check (P1.3 optimization) ──────────────────────────────
    // If we cached Java for this major version in this session, skip re-detection
    let javaPaths = [];
    if (_javaCacheByVersion[requiredMajor]) {
      console.log(`[Launcher] ✓ Usando Java cacheado para v${requiredMajor}: ${_javaCacheByVersion[requiredMajor]}`);
      javaPaths = [{ path: _javaCacheByVersion[requiredMajor], major_version: requiredMajor }];
    } else {
      javaPaths = await tauriCmd('detect_java', { launcherDir });
    }

    // Filtrar Java adecuado por versión
    let suitable = requiredMajor === 8
      ? javaPaths.filter(j => j.major_version === 8)
      : javaPaths.filter(j => j.major_version >= requiredMajor);

    // Ordenar: rutas absolutas primero (evita usar bare "java" cuando hay ruta completa disponible)
    const isAbsPath = (p) => p.includes('/') || p.includes('\\');
    suitable.sort((a, b) => {
      const aIsAbs = isAbsPath(a.path);
      const bIsAbs = isAbsPath(b.path);
      if (aIsAbs !== bIsAbs) return aIsAbs ? -1 : 1;
      return 0;
    });

    // Validar el mejor candidato (solo rutas absolutas — los comandos bare ya los verificó detect_java)
    if (suitable.length > 0) {
      const candidate = suitable[0];
      console.log(`[Launcher] Verificando Java: ${candidate.path}`);

      if (isAbsPath(candidate.path)) {
        const validation = await validateJavaInstallation(candidate.path);
        if (!validation.valid) {
          console.warn(`[Launcher] Java no válido: ${validation.reason}`);
          console.log(`[Launcher] Intentando auto-reparación...`);
          onJavaProgress?.({ phase: 'repair', percent: 0, requiredMajor });
          try {
            const repairResult = await autoRepairJava(requiredMajor, launcherDir, onJavaProgress);
            if (repairResult.success) {
              suitable = [{ path: repairResult.javaPath, major_version: requiredMajor }];
              console.log(`[Launcher] ✓ Java reparado: ${repairResult.javaPath}`);
              onJavaProgress?.({ phase: 'done', percent: 100, requiredMajor });
            } else {
              throw new Error(`Reparación fallida: ${repairResult.error}`);
            }
          } catch (err) {
            console.error(`[Launcher] Reparación falló, descargando nueva copia...`);
            suitable = [];
          }
        }
      } else {
        // Comando bare (ej: "java") — detect_java ya lo verificó al ejecutarlo para obtener la versión
        console.log(`[Launcher] Java bare command "${candidate.path}" — aceptado (pre-verificado por detect_java)`);
      }
    }

    // Si no hay Java, descargarlo
    if (suitable.length === 0) {
      console.log(`[Launcher] Descargando Java ${requiredMajor}...`);
      onJavaProgress?.({ phase: 'start', percent: 0, requiredMajor });
      try {
        const javaExePath = await tauriCmd('install_java_runtime', { majorVersion: requiredMajor, launcherDir });
        if (!javaExePath || typeof javaExePath !== 'string' || javaExePath.trim() === '') {
          throw new Error(`Ruta inválida: "${javaExePath}"`);
        }
        suitable = [{ path: javaExePath, major_version: requiredMajor }];
        console.log(`[Launcher] ✓ Java descargado: ${javaExePath}`);
        onJavaProgress?.({ phase: 'done', percent: 100, requiredMajor });
      } catch (err) {
        console.error(`[Launcher] ✗ No se pudo descargar Java: ${err.message}`);
        throw new Error(
          `No se pudo descargar Java ${requiredMajor}.\n\n` +
          `Causas posibles:\n` +
          `• Sin conexión a internet\n` +
          `• Adoptium API no disponible\n` +
          `• Espacio en disco insuficiente\n\n` +
          `Error: ${err.message}`
        );
      }
    }

    suitable.sort((a, b) => {
      // Prefer absolute paths > bare commands, then exact version match, then ascending version
      const aIsAbs = isAbsPath(a.path);
      const bIsAbs = isAbsPath(b.path);
      if (aIsAbs !== bIsAbs) return aIsAbs ? -1 : 1;
      const aExact = a.major_version === requiredMajor ? 0 : 1;
      const bExact = b.major_version === requiredMajor ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.major_version - b.major_version;
    });

    if (!suitable || suitable.length === 0) {
      throw new Error('No se encontró Java instalado.');
    }

    const javaPath = suitable[0].path;
    console.log(`[Launcher] ✓ Java v${suitable[0].major_version} listo: ${javaPath}`);

    // ─── Cache the resolved Java path (P1.3 optimization) ────────────────────
    _javaCacheByVersion[requiredMajor] = javaPath;
    console.log(`[Launcher] Cached Java v${requiredMajor} for session: ${javaPath}`);

    // ─────────────────────────────────────────────────────────────────────────
    // FASE 2: Validar Minecraft JAR (crítico para Forge/NeoForge)
    // ─────────────────────────────────────────────────────────────────────────
    if (instance.loader === 'forge' || instance.loader === 'neoforge') {
      console.log(`[Launcher] FASE 2: Validación de Minecraft JAR...`);
      const { getClientJarPath, validateMinecraftJar, autoRepairMinecraftJar } = await import('./minecraft-jar-repair.js');
      const jarPath = getClientJarPath(launcherDir, instance.version);
      const validation = await validateMinecraftJar(jarPath);

      if (!validation.valid) {
        console.warn(`[Launcher] JAR faltante: ${validation.reason}`);
        onRepairProgress?.({ phase: 'jar', label: `Descargando Minecraft ${instance.version}...`, percent: 0 });
        const repair = await autoRepairMinecraftJar(instance.version, versionData, launcherDir, onRepairProgress);
        if (!repair.success) {
          throw new Error(`Failed to download Minecraft JAR: ${repair.error}`);
        }
        console.log(`[Launcher] ✓ Minecraft JAR listo: ${repair.jarPath}`);
      } else {
        console.log(`[Launcher] ✓ Minecraft JAR validado: ${jarPath}`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FASE 3: Validar y reparar perfiles del loader
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`[Launcher] FASE 3: Validación de perfil del loader...`);
    await ensureLoaderProfileUpToDate(instance, launcherDir, versionData, onRepairProgress);

    // FASE 3.5: Cargar perfil de loader si existe (Forge, Quilt, NeoForge)
    // Variable para acumular argumentos Java temporales (incluyendo instalador si aplica)
    let javaArgsForLaunch = instance.javaArgs || '';

    // Si el loader no es vanilla, debemos cargar su perfil para obtener el mainClass y librerías correctas
    if (instance.loader !== 'vanilla' && instance.loaderVersion) {
      // Resolver la ruta del perfil — probamos varios candidatos porque el loaderVersion
      // puede venir en distintos formatos según si la instancia fue creada antes o después del fix:
      //   Legacy:  "1.20.1-0.19.2"                 → busca en versions/1.20.1-fabric-0.19.2/
      //   Nuevo:   "1.20.1-fabric-0.19.2"           → busca en versions/1.20.1-fabric-0.19.2/ (correcto)
      //   Forge:   "1.20.1-47.4.20"                 → busca en versions/1.20.1-47.4.20/ (correcto)
      const loaderName = instance.loader; // 'fabric' | 'quilt' | 'forge' | 'neoforge'
      const lv = instance.loaderVersion;
      const mcv = instance.version;

      // Candidatos en orden de preferencia
      const profileCandidates = [
        lv,                                        // tal cual está guardado (nuevo formato o Forge)
        `${mcv}-${loaderName}-${lv.replace(`${mcv}-`, '')}`, // legacy sin loader name → agregar
      ].filter((v, i, arr) => arr.indexOf(v) === i); // deduplicar

      let loaderProfileText = null;
      let loaderProfilePath = null;
      let effectiveCandidate = lv; // tracks which candidate profile was actually found
      for (const candidate of profileCandidates) {
        const candidatePath = `${launcherDir}/versions/${candidate}/${candidate}.json`;
        try {
          loaderProfileText = await readFile(candidatePath);
          loaderProfilePath = candidatePath;
          effectiveCandidate = candidate; // remember the version string that matched on disk
          // Si el candidato difiere del loaderVersion guardado, actualizar instancia en disco
          if (candidate !== lv) {
            console.log(`[Launcher] ✓ Perfil encontrado via candidato alternativo: ${candidate}`);
            // Actualizar loaderVersion en instances.json silenciosamente para futuros lanzamientos
            try {
              const instancesPath = `${launcherDir}/instances.json`;
              const instancesText = await readFile(instancesPath);
              const instances = JSON.parse(instancesText);
              const idx = instances.findIndex(i => i.id === instance.id);
              if (idx !== -1) {
                instances[idx].loaderVersion = candidate;
                await writeFile(instancesPath, JSON.stringify(instances, null, 2));
                console.log(`[Launcher] ✓ loaderVersion corregido en instances.json: ${lv} → ${candidate}`);
              }
            } catch (updateErr) {
              console.warn(`[Launcher] No se pudo actualizar loaderVersion en instances.json:`, updateErr.message);
            }
          }
          break;
        } catch (_) {
          // siguiente candidato
        }
      }

      if (!loaderProfileText) {
        console.warn(`[Launcher] ⚠️ Perfil de ${loaderName} no encontrado. Candidatos probados: ${profileCandidates.join(', ')}`);
      }

      try {
        if (!loaderProfileText) throw new Error(`Perfil no encontrado en disco`);
        const loaderProfile = JSON.parse(loaderProfileText);

        // Detectar perfil legacy de Fabric/Quilt: librerías sin downloads.artifact (formato antiguo incorrecto)
        // Si las librerías no tienen el path que Rust puede leer, el juego lanza vanilla en lugar del loader
        const isFabricLike = instance.loader === 'fabric' || instance.loader === 'quilt';
        const hasUsableLibraries = (loaderProfile.libraries ?? []).some(lib => lib.downloads?.artifact?.path);
        if (isFabricLike && !hasUsableLibraries && (loaderProfile.libraries ?? []).length > 0) {
          console.warn(`[Launcher] ⚠️ Perfil de ${instance.loader} tiene librerías en formato legacy (sin downloads.artifact). Reinstalando...`);
          const { installLoader } = await import('./loaders');
          const { downloadQueue } = await import('./downloader.js');
          // Extract the bare loader version from the effective profileId for installLoader.
          // E.g., effectiveCandidate "1.20.1-fabric-0.19.2" → "0.19.2" for Fabric API.
          const { extractRealVersion } = await import('./loader-repair.js');
          const reinstallVersion = extractRealVersion(instance.loader, effectiveCandidate);
          console.log(`[Launcher] Reinstalando ${instance.loader} con versión: ${reinstallVersion}`);
          const loaderResult = await installLoader(
            instance.loader,
            reinstallVersion,
            instance.version,
            launcherDir,
            versionData
          );
          if (loaderResult.downloadTasks?.length > 0) {
            await new Promise((resolve, reject) => {
              downloadQueue({
                tasks: loaderResult.downloadTasks,
                concurrency: 4,
                onDone: ({ failed }) => failed > 0 ? reject(new Error(`${failed} libs fallaron`)) : resolve(),
              }).run().catch(reject);
            });
          }
          // Releer el perfil regenerado
          const newProfileText = await readFile(loaderProfilePath);
          Object.assign(loaderProfile, JSON.parse(newProfileText));
          console.log(`[Launcher] ✓ Perfil de ${instance.loader} regenerado con ${loaderProfile.libraries?.length ?? 0} librerías normalizadas`);
        }

        // Actualizar versionData con el mainClass del loader si existe
        if (loaderProfile.mainClass) {
          console.log(`[Launcher] ✓ Perfil de ${instance.loader} cargado: mainClass=${loaderProfile.mainClass}`);
          versionData.mainClass = loaderProfile.mainClass;
        }

        // Argumentos del juego: fusionar los del loader con vanilla, no reemplazar.
        // CRÍTICO: Mantener versionData.arguments (contiene --assetsDir, --assetIndex)
        // Los args del loader (--launchTarget, --fml.forgeVersion) se AÑADEN al array.
        if (loaderProfile.minecraftArguments) {
          // Loader usa formato legacy (string) - típico en Forge/ForgeWrapper
          // Dividimos sus args y los añadimos al array moderno de vanilla
          if (versionData.arguments && typeof versionData.arguments === 'object') {
            const argsMap = versionData.arguments;
            if (argsMap.game && Array.isArray(argsMap.game)) {
              // Split loader's minecraftArguments y append al array de game args
              const loaderTokens = loaderProfile.minecraftArguments.split(/\s+/).filter(t => t);
              argsMap.game = [...argsMap.game, ...loaderTokens];
              console.log(`[Launcher] ✓ Agregados ${loaderTokens.length} argumentos de ${instance.loader} al game arguments (preservando assets)`);
            }
          } else {
            // Fallback: si no hay formato moderno, usar el legacy del loader
            versionData.minecraftArguments = loaderProfile.minecraftArguments;
            console.log(`[Launcher] ✓ Usando minecraftArguments de ${instance.loader} (fallback a legacy)`);
          }
        } else if (loaderProfile.arguments) {
          // Loader usa formato moderno (array) — fusiona con vanilla
          if (versionData.arguments && typeof versionData.arguments === 'object' &&
              loaderProfile.arguments && typeof loaderProfile.arguments === 'object') {
            // Merge ambos arrays de game args
            const vanillaGameArgs = versionData.arguments.game || [];
            const loaderGameArgs = loaderProfile.arguments.game || [];
            versionData.arguments.game = [...vanillaGameArgs, ...loaderGameArgs];
            console.log(`[Launcher] ✓ Fusionados arguments de ${instance.loader} (moderno + vanilla)`);
          } else {
            // Fallback: reemplazar enteros
            versionData.arguments = loaderProfile.arguments;
            console.log(`[Launcher] ✓ Usando arguments de ${instance.loader} (reemplazo)`);
          }
        }

        // CRÍTICO: Agregar librerías del loader (ej: ForgeWrapper, securejarhandler, etc.)
        // Estas librerías son necesarias para que ForgeWrapper funcione
        if (loaderProfile.libraries && Array.isArray(loaderProfile.libraries)) {
          console.log(`[Launcher] Agregando ${loaderProfile.libraries.length} librerías del loader al classpath`);
          versionData.libraries = [...(versionData.libraries || []), ...loaderProfile.libraries];
        }

        // CRÍTICO PARA LOADERS CON INSTALADOR (Forge, NeoForge): Reparar/descargar instalador
        // IMPORTANTE: Construye javaArgsForLaunch temporal, NO modifica instance.javaArgs del store
        if ((instance.loader === 'forge' || instance.loader === 'neoforge') && instance.loaderVersion) {
          console.log(`[Launcher] FASE 3.6: Reparación de instalador de ${instance.loader}...`);
          try {
            const installerPath = await getLoaderInstallerPath(instance, launcherDir, onRepairProgress);

            if (installerPath) {
              console.log(`[Launcher] ✓ Instalador de ${instance.loader} listo: ${installerPath}`);

              // Ruta del client JAR de Minecraft — ForgeWrapper necesita -Dforgewrapper.minecraft
              const minecraftJarPath = `${launcherDir}/libraries/net/minecraft/client/${instance.version}/client-${instance.version}.jar`;

              // Construir argumentos en variable TEMPORAL (sin modificar el store)
              // ForgeWrapper requiere AMBAS propiedades del sistema:
              //   -Dforgewrapper.installer  → el JAR del instalador de Forge
              //   -Dforgewrapper.minecraft  → el client.jar de Minecraft vanilla
              const forgeWrapperArgs = [
                `-Dforgewrapper.installer=${installerPath}`,
                `-Dforgewrapper.minecraft=${minecraftJarPath}`,
              ].join(' ');

              javaArgsForLaunch = `${forgeWrapperArgs} ${javaArgsForLaunch}`.trim();
              console.log(`[Launcher] ✓ ForgeWrapper args agregados a JVM (no se guarda en store):`);
              console.log(`[Launcher]   installer: ${installerPath}`);
              console.log(`[Launcher]   minecraft: ${minecraftJarPath}`);
            } else {
              throw new Error('No se pudo obtener ruta del instalador');
            }
          } catch (err) {
            console.error(`[Launcher] ✗ Error al reparar instalador de ${instance.loader}: ${err.message}`);
            throw new Error(`No se pudo preparar instalador de ${instance.loader}: ${err.message}`);
          }
        }
      } catch (err) {
        // Los errores del instalador de Forge/NeoForge son fatales — sin instalador no puede arrancar
        if (instance.loader === 'forge' || instance.loader === 'neoforge') {
          throw err;
        }
        // Para Fabric/Quilt un perfil faltante es degradación a vanilla (no ideal pero no fatal)
        console.warn(`[Launcher] ⚠️ No se pudo cargar perfil de ${instance.loader}: ${err.message}`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FASE 4: Aplicar skins (best-effort, no bloquea)
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`[Launcher] FASE 4: Aplicando skins...`);
    try {
      await applySkinToInstance(instance, profile, launcherDir);
    } catch (err) {
      console.warn('[Launcher] Error aplicando skin:', err.message);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FASE 5: DELEGACIÓN A RUST
    // Toda la lógica pesada de preparación se ejecuta en Rust para mejor perf
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`[Launcher] FASE 5: Preparación de lanzamiento (en Rust)...`);
    console.log(`[Launcher] Preparando LaunchConfig...`);

    // Construir el objeto de instancia para Rust (debe coincidir con GameInstance struct)
    // CRÍTICO: La struct Rust usa #[serde(rename_all = "camelCase")], así que los
    // nombres deben ser camelCase para que serde los deserialice correctamente.
    // java_args (snake_case) → Rust lo ignora silenciosamente; "javaArgs" (camelCase) → funciona.
    const gameInstance = {
      id: instance.id,
      name: instance.name,
      version: instance.version,
      loader: instance.loader,
      loaderVersion: instance.loaderVersion || null,   // camelCase → loader_version en Rust
      javaArgs: javaArgsForLaunch,                     // camelCase → java_args en Rust (incluye -Dforgewrapper.installer)
      maxRam: instance.ram || instance.maxRam || null, // camelCase → max_ram en Rust
      gameType: instance.gameType || null,              // camelCase → game_type en Rust
    };

    // Construir el objeto de perfil para Rust (debe coincidir con GameProfile struct)
    const gameProfile = {
      name: profile.name || profile.username || 'Player',  // Fallback si no hay nombre
      uuid: profile.uuid || '00000000-0000-0000-0000-000000000000',
    };

    // Construir el objeto de datos de versión para Rust (debe coincidir con GameVersionData struct)
    // NOTA: assetIndex.id puede diferir de la versión MC (ej: MC 1.19.2 → assetIndex "1.19")
    const assetsIndexName = versionData.assetIndex?.id ?? versionData.assets ?? instance.version;
    const gameVersionData = {
      mainClass: versionData.mainClass,
      libraries: versionData.libraries || [],
      arguments: versionData.arguments || null,
      minecraftArguments: versionData.minecraftArguments || null,
      assetsIndexName,  // camelCase → assets_index_name en Rust
    };
    console.log(`[Launcher] Asset index: ${assetsIndexName} (MC version: ${instance.version})`);

    // Llamar al comando Rust que prepara toda la configuración
    // IMPORTANTE: Usar camelCase para los parámetros (Tauri convierte de snake_case en Rust)
    const launchConfig = await tauriCmd('prepare_game_launch', {
      instance: gameInstance,
      profile: gameProfile,
      launcherDir,  // camelCase, no snake_case
      versionData: gameVersionData,  // camelCase, no snake_case
      javaPath,  // Ya detectado y validado en JavaScript
    });

    console.log(`[Launcher] ✓ LaunchConfig generado en Rust`);
    console.log(`[Launcher] MainClass: ${launchConfig.main_class}`);
    console.log(`[Launcher] JVM Args: ${launchConfig.jvm_args.length} args`);
    console.log(`[Launcher] Classpath: ${launchConfig.classpath.length} chars`);

    // ─────────────────────────────────────────────────────────────────────────
    // FASE 6: Lanzar el juego
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`[Launcher] FASE 6: Lanzando juego...`);
    console.log(`[Launcher] Java: ${launchConfig.java_path}`);
    console.log(`[Launcher] GameDir: ${launchConfig.game_dir}`);

    await tauriCmd('launch_game', { config: launchConfig });
    console.log(`[Launcher] ✓ Juego lanzado exitosamente`);

  } catch (error) {
    const msg = error?.message ?? (typeof error === 'string' ? error : JSON.stringify(error));
    console.error(`[Launcher] ✗ Error: ${msg}`);
    throw new Error(`Error al lanzar el juego: ${msg}`);
  }
}

/**
 * Event listeners for game logging and termination
 */
export function listenGameEvents(onLog, onStopped) {
  let unlistenLog;
  let unlistenStopped;

  tauriListen('game://log', (payload) => {
    onLog(payload);
  }).then(fn => { unlistenLog = fn; });

  tauriListen('game://stopped', (exitCode) => {
    onStopped(exitCode);
  }).then(fn => { unlistenStopped = fn; });

  return () => {
    unlistenLog?.();
    unlistenStopped?.();
  };
}

export default {
  launchGameInstance,
  listenGameEvents,
};
