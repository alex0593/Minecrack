// launcher.js — Lógica de lanzamiento del juego
import { buildLaunchArgs } from './instances';
import { buildClasspath } from './mojang';
import { tauriCmd, tauriListen, ensureDir, readFile, installJavaRuntime } from './tauri';
import { getRequiredJavaVersion } from './prism';

function getLoaderProfileId(instance) {
  const { loader, loaderVersion, version } = instance;
  if (!loaderVersion || loader === 'vanilla') return null;
  if (loader === 'fabric')   return `${version}-fabric-${loaderVersion}`;
  if (loader === 'quilt')    return `${version}-quilt-${loaderVersion}`;
  if (loader === 'neoforge') return `${version}-neoforge-${loaderVersion}`;
  if (loader === 'forge')    return loaderVersion; // Forge usa el loaderVersion como ID: "1.20.1-47.2.0"
  return null;
}

export async function launchGameInstance({ instance, profile, launcherDir, versionData, onJavaProgress }) {
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
      console.log(`[Launcher] No hay Java ${requiredMajor}${requiredMajor === 8 ? ' (exacto)' : '+'}. Descargando...`);
      onJavaProgress?.({ phase: 'start', percent: 0, requiredMajor });

      const javaExePath = await installJavaRuntime(requiredMajor, launcherDir);

      onJavaProgress?.({ phase: 'done', percent: 100, requiredMajor });
      suitable = [{ path: javaExePath, major_version: requiredMajor }];
    }

    // Ordenar por preferencia: exacta primero, luego por versión
    suitable.sort((a, b) => {
      const aExact = a.major_version === requiredMajor ? 0 : 1;
      const bExact = b.major_version === requiredMajor ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.major_version - b.major_version;
    });
    const javaPath = suitable[0].path;
    console.log(`[Launcher] Usando Java ${suitable[0].major_version} (requería ${requiredMajor}): ${javaPath}`);

    // Directorio de assets
    const assetsDir = `${launcherDir}/assets`;

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

    console.log(`[Launcher] Lanzando con mainClass: ${config.main_class}`);
    console.log(`[Launcher] JVM args: ${config.jvm_args.join(' ')}`);
    console.log(`[Launcher] Game args: ${config.game_args.join(' ')}`);
    console.log(`[Launcher] Game dir: ${config.game_dir}`);
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
