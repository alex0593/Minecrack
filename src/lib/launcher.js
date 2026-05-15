// launcher.js — Lógica de lanzamiento del juego
import { buildLaunchArgs } from './instances';
import { buildClasspath } from './mojang';
import { tauriCmd, tauriListen, ensureDir, readFile, fileExists, installJavaRuntime } from './tauri';
import { getRequiredJavaVersion } from './prism';
import { installLoader } from './loaders';
import { downloadQueue } from './downloader';
import { LAUNCHER } from '../config';
import { applySkinToInstance } from './skin';

function getLoaderProfileId(instance) {
  const { loader, loaderVersion, version } = instance;
  if (!loaderVersion || loader === 'vanilla') return null;
  if (loader === 'fabric')   return `${version}-fabric-${loaderVersion}`;
  if (loader === 'quilt')    return `${version}-quilt-${loaderVersion}`;
  if (loader === 'neoforge') return `${version}-neoforge-${loaderVersion}`;
  if (loader === 'forge')    return loaderVersion; // Forge usa el loaderVersion como ID: "1.20.1-47.2.0"
  return null;
}

/**
 * Auto-repara perfiles Forge/NeoForge legacy (sin formatVersion: 2).
 * Estos perfiles fueron generados antes del fix de mavenFiles y carecen
 * del installer JAR + dependencias auxiliares que ForgeWrapper necesita.
 *
 * @returns {Promise<boolean>} true si se realizó reparación, false si no fue necesaria
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
      }
    } catch (err) {
      needsRepair = true;
      reason = `perfil ilegible: ${err.message}`;
    }
  }

  if (!needsRepair) return false;

  console.log(`[Launcher] Auto-reparación de ${instance.loader}: ${reason}`);
  onRepairProgress?.({ phase: 'start', label: `Reparando instalación de ${instance.loader}…`, percent: 0 });

  const result = await installLoader(
    instance.loader,
    instance.loaderVersion,
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

export async function launchGameInstance({ instance, profile, launcherDir, versionData, onJavaProgress, onRepairProgress }) {
  try {
    // Detectar Java y elegir la versión correcta
    // Usamos Prism Meta como fuente primaria para el requisito de Java (más confiable)
    // Pasamos launcherDir para que busque también en runtimes/
    const javaPaths = await tauriCmd('detect_java', { launcherDir });
    const prismJava = await getRequiredJavaVersion(instance.version).catch(() => null);
    const requiredMajor = prismJava ?? versionData?.javaVersion?.majorVersion ?? 17;
    console.log(`[Launcher] Java requerido para MC ${instance.version}: ${requiredMajor}`);

    // Para Java 8, buscar EXACTAMENTE 8 (LaunchWrapper no es compatible con 9+)
    // Para otras versiones, usar >= requiredMajor
    let suitable;
    if (requiredMajor === 8) {
      suitable = javaPaths.filter(j => j.major_version === 8);
    } else {
      suitable = javaPaths.filter(j => j.major_version >= requiredMajor);
    }

    // Si no hay Java adecuado, descargarlo automáticamente
    if (suitable.length === 0) {
      console.log(`[Launcher] No hay Java ${requiredMajor}${requiredMajor === 8 ? ' (exacto)' : '+'}. Descargando automáticamente...`);
      onJavaProgress?.({ phase: 'start', percent: 0, requiredMajor });

      try {
        const javaExePath = await installJavaRuntime(requiredMajor, launcherDir);

        // ✓ VALIDACIÓN CRÍTICA: La descarga debe retornar una ruta válida
        if (!javaExePath || typeof javaExePath !== 'string' || javaExePath.trim() === '') {
          throw new Error(`Descarga de Java retornó ruta inválida: "${javaExePath}"`);
        }

        onJavaProgress?.({ phase: 'done', percent: 100, requiredMajor });
        suitable = [{ path: javaExePath, major_version: requiredMajor }];
        console.log(`[Launcher] ✓ Java ${requiredMajor} descargado exitosamente: ${javaExePath}`);
      } catch (err) {
        const errMsg = err?.message || String(err);
        console.error(`[Launcher] ✗ CRÍTICO: No se pudo descargar Java ${requiredMajor}: ${errMsg}`);
        throw new Error(
          `No se pudo descargar Java ${requiredMajor}.\n\n` +
          `Causas posibles:\n` +
          `• Sin conexión a internet\n` +
          `• Adoptium API no disponible\n` +
          `• Espacio en disco insuficiente\n\n` +
          `Error: ${errMsg}\n\n` +
          `Solución: Instala Java 17+ manualmente de https://www.oracle.com/java/technologies/downloads/`
        );
      }
    }

    // Ordenar por preferencia: exacta primero, luego por versión
    suitable.sort((a, b) => {
      const aExact = a.major_version === requiredMajor ? 0 : 1;
      const bExact = b.major_version === requiredMajor ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.major_version - b.major_version;
    });

    // ✓ VALIDACIÓN CRÍTICA: Asegurar que hay una ruta Java válida
    if (!suitable || suitable.length === 0) {
      throw new Error('No se encontró Java instalado. Instala JDK 17 o superior.');
    }

    const javaPath = suitable[0].path;
    if (!javaPath) {
      throw new Error(`Error crítico: ruta de Java es vacía o undefined. Instalación de Java corrupta?`);
    }

    console.log(`[Launcher] ✓ Java detectado: v${suitable[0].major_version}`);
    console.log(`[Launcher] ✓ Ruta Java: ${javaPath}`);
    console.log(`[Launcher] (requería v${requiredMajor}+)`);

    // Directorio de assets
    const assetsDir = `${launcherDir}/assets`;

    // Auto-reparar perfiles Forge/NeoForge legacy antes de cargar
    await ensureLoaderProfileUpToDate(instance, launcherDir, versionData, onRepairProgress);

    // Aplicar skin custom si corresponde (no bloquea — best effort)
    try {
      await applySkinToInstance(instance, profile, launcherDir);
    } catch (err) {
      console.warn('[Launcher] Error aplicando skin:', err.message);
    }

    // Cargar perfil del loader si aplica
    let effectiveVersionData = versionData;
    let extraJvmArgs = [];
    let classpathVersionId = instance.version; // por defecto usa versión vanilla
    const profileId = getLoaderProfileId(instance);
    if (profileId) {
      try {
        const profilePath = `${launcherDir}/versions/${profileId}/${profileId}.json`;
        const profileJson = await readFile(profilePath);
        const loaderProfile = JSON.parse(profileJson);
        console.log(`[Launcher] Perfil del loader cargado: ${profileId} (mainClass: ${loaderProfile.mainClass})`);

        // El client JAR viene del perfil heredado (inheritsFrom), no del loader profile
        const inheritedId = loaderProfile.inheritsFrom || instance.version;
        classpathVersionId = inheritedId;

        // Extraer JVM args del perfil del loader (será resuelto después con classpath disponible)
        const profileJvmArgs = loaderProfile.arguments?.jvm ?? [];
        extraJvmArgs = profileJvmArgs.filter(arg => typeof arg === 'string');

        if (extraJvmArgs.length > 0) {
          console.log(`[Launcher] JVM args del loader (sin resolver):`, extraJvmArgs);
        }

        effectiveVersionData = {
          ...versionData,
          mainClass: loaderProfile.mainClass,
          libraries: [
            ...(loaderProfile.libraries ?? []),
            ...(versionData.libraries ?? []),
          ],
          // Mergear arguments del loader profile (necesario para Forge tweakers)
          arguments: loaderProfile.arguments || versionData.arguments,
          minecraftArguments: loaderProfile.minecraftArguments || versionData.minecraftArguments,
        };

        // Si es ForgeWrapper, agregar sistema property explícito señalando al installer JAR
        const isForgeWrapper = loaderProfile.mainClass?.includes('forgewrapper') ||
                                loaderProfile.mainClass?.includes('ForgeWrapper');
        if (isForgeWrapper && instance.loader === 'forge') {
          // El profileId para Forge es el forgeVersion mismo (ej: "1.19.2-43.5.2")
          // La ruta final sería: libraries/net/minecraftforge/forge/{version}/forge-{version}-installer.jar
          let installerJarPath = `${launcherDir}/libraries/net/minecraftforge/forge/${profileId}/forge-${profileId}-installer.jar`;

          // IMPORTANTE: Convertir backslashes a forward slashes para Windows
          // Java/ForgeWrapper espera forward slashes incluso en Windows
          installerJarPath = installerJarPath.replace(/\\/g, '/');

          // Agregar propiedad que ForgeWrapper requiere para localizar el installer
          // ForgeWrapper específicamente busca la propiedad -Dforgewrapper.installer
          if (!extraJvmArgs.some(arg => arg.includes('forgewrapper.installer'))) {
            extraJvmArgs.push(`-Dforgewrapper.installer=${installerJarPath}`);
            console.log(`[Launcher] ✓ Agregada propiedad forgewrapper.installer=${installerJarPath}`);
          }
        }
      } catch (err) {
        console.warn(`[Launcher] No se pudo cargar perfil del loader ${profileId}:`, err.message);
      }
    }

    // Construir args de lanzamiento
    const launchArgs = buildLaunchArgs({
      instance,
      profile,
      javaPath,
      gameDirBase: `${launcherDir}/instances`,
      assetsDir,
      versionJson: effectiveVersionData,
    });

    // Construir classpath — usa classpathVersionId que ya se determinó arriba
    const classpath = buildClasspath(effectiveVersionData, launcherDir, classpathVersionId);

    // Log de diagnóstico del classpath
    const classpathEntries = classpath.split(navigator.platform.includes('Win') ? ';' : ':');
    console.log(`[Launcher] Classpath (${classpathEntries.length} entradas):`);
    classpathEntries.forEach(e => console.log(`  ▸ ${e}`));

    // Crear directorios de instancia
    const base = `${launcherDir}/instances/${instance.id}`;
    await ensureDir(`${base}/mods`);
    await ensureDir(`${base}/config`);
    await ensureDir(`${base}/saves`);
    await ensureDir(`${base}/natives`);

    // Resolver variables en JVM args del loader (ahora tenemos classpath disponible)
    const nativesDir = `${launcherDir}/instances/${instance.id}/natives`;
    const librariesDir = `${launcherDir}/libraries`;
    const resolveLoaderArg = (arg) => arg
      .replace(/\$\{LIBRARY_DIR\}/g, librariesDir)
      .replace(/\$\{MINECRAFT_JAR\}/g, `${launcherDir}/versions/${classpathVersionId}/${classpathVersionId}.jar`)
      .replace(/\$\{MINECRAFT_VERSION\}/g, instance.version)
      .replace(/\$\{natives_directory\}/g, nativesDir)
      .replace(/\$\{launcher_name\}/g, 'Minecrack')
      .replace(/\$\{launcher_version\}/g, '1.0.0')
      .replace(/\$\{clientid\}/g, '')
      .replace(/\$\{auth_xuid\}/g, '');

    // Resolver variables y filtrar args inválidos
    const resolvedExtraJvmArgs = extraJvmArgs
      .map(resolveLoaderArg)
      // Filtrar argumentos inválidos como "-cp ${classpath}" que no se resuelven
      .filter(arg => !arg.includes('${') && arg !== '-cp');

    // Invocar comando de lanzamiento a Rust
    // Deduplicar -D flags (las del loader overridean las base)
    const jvmArgsMap = new Map();
    const allJvmArgs = [...launchArgs.jvmArgs, ...resolvedExtraJvmArgs];
    for (const arg of allJvmArgs) {
      if (arg.startsWith('-D')) {
        const key = arg.split('=')[0]; // ej: "-Djava.library.path"
        jvmArgsMap.set(key, arg);
      } else {
        // Para args sin -D (como -Xmx, -XX:), permitir múltiples
        // Usar array value para mantener orden
        if (!jvmArgsMap.has(arg)) jvmArgsMap.set(arg, arg);
      }
    }
    const dedupedJvmArgs = Array.from(jvmArgsMap.values());

    const config = {
      java_path: javaPath,
      jvm_args: dedupedJvmArgs,
      classpath,
      main_class: launchArgs.mainClass,
      game_args: launchArgs.gameArgs,
      game_dir: launchArgs.gameDir,
    };

    // ✓ LOG CRÍTICO: Ver exactamente qué se envía a Rust
    console.log(`[Launcher] ============ ENVIANDO CONFIGURACIÓN A RUST ============`);
    console.log(`[Launcher] java_path: ${config.java_path}`);
    console.log(`[Launcher] main_class: ${config.main_class}`);
    console.log(`[Launcher] game_dir: ${config.game_dir}`);
    console.log(`[Launcher] jvm_args (${config.jvm_args.length}): ${config.jvm_args.join(' ')}`);
    console.log(`[Launcher] game_args (${config.game_args.length}): ${config.game_args.join(' ')}`);
    console.log(`[Launcher] classpath chars: ${config.classpath.length}`);
    console.log(`[Launcher] ===================================================`);
    console.log(`[Launcher] Invocando launch_game...`);

    await tauriCmd('launch_game', { config });
    console.log(`[Launcher] launch_game completado (proceso terminado).`);

  } catch (error) {
    // Tauri puede devolver un string puro (error de Rust), no siempre un Error object
    const msg = error?.message ?? (typeof error === 'string' ? error : JSON.stringify(error));
    throw new Error(`Error al lanzar el juego: ${msg}`);
  }
}

// Escucha eventos del juego (logs y salida)
export function listenGameEvents(onLog, onStopped) {
  let unlistenLog;
  let unlistenStopped;

  // tauriListen ya extrae el payload — el handler recibe el payload directamente
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
