# Guía de Diagnóstico - ForgeWrapper Installer Issue

## Cambios Implementados para Diagnóstico

### 1. Conversión de Rutas (JavaScript)
El argumento `-Dforgewrapper.installer` ahora convierte todas las rutas a **forward slashes** antes de pasarlas a Java:

```javascript
// Antes: C:\path\to\installer.jar (backslashes pueden causar problemas)
// Después: C:/path/to/installer.jar (forward slashes - Java-friendly)
installerJarPath = installerJarPath.replace(/\\/g, '/');
```

**Por qué**: Java en Windows puede tener problemas interpretando backslashes en argumentos de línea de comandos.

### 2. Log Diagnóstico Completo (Rust)
Ahora al lanzar el juego, Rust imprime todos los argumentos **exactamente como se envían a Java**:

```
[Rust] ============ COMANDO DE LANZAMIENTO ============
[Rust] Java: C:\Program Files\Java\jdk-17\bin\java.exe
[Rust] Main Class: io.github.zekerzhayard.forgewrapper.installer.Main
[Rust] Game Dir: C:\Minecrack\instances\TINKERS-CREATE
[Rust] JVM Args (12 total):
[Rust]   [0] -Xmx2048m
[Rust]   [1] -Xms512m
[Rust]   [2] -Dforgewrapper.installer=C:/path/to/forge-1.19.2-43.5.2-installer.jar
[Rust]   [3] -Djava.library.path=...
[Rust]   ... más args ...
[Rust] Classpath entries: 142
[Rust]   FIRST: C:\path\to\ForgeWrapper-prism-2025-12-07.jar
[Rust]   LAST: C:\path\to\client.jar
[Rust] ===================================================
```

## Cómo Diagnosticar el Problema

### Paso 1: Ejecutar el Launcher
1. Abre Minecrack
2. Intenta lanzar la instancia Forge importada
3. Observa la **consola de la aplicación** (ventana Rust/backend)

### Paso 2: Revisar los Logs de Rust
Busca la sección `[Rust] ============ COMANDO DE LANZAMIENTO ============`

**Verifica estos puntos**:

#### ✓ Punto de control A: ¿El argumento está presente?
```
Busca: [Rust]   [X] -Dforgewrapper.installer=C:/...
```
- ✅ **Si está**: El argumento se está pasando correctamente
- ❌ **Si NO está**: El argumento no se agregó a los JVM args (problema en JavaScript)

#### ✓ Punto de control B: ¿La ruta es absoluta y válida?
```
[Rust]   [X] -Dforgewrapper.installer=C:/Users/ALEXIS/AppData/Local/.../forge-1.19.2-43.5.2-installer.jar
```
- ✅ **Si empieza con C:/ o similar**: Ruta absoluta correcta
- ❌ **Si es relativa o contiene "${...}"**: Ruta no fue resuelta correctamente

#### ✓ Punto de control C: ¿El instalador existe en esa ruta?
```
Desde tu explorador de archivos, navega a:
C:/Users/ALEXIS/AppData/Local/.minecraft/libraries/net/minecraftforge/forge/1.19.2-43.5.2/
```
- ✅ **Si ves `forge-1.19.2-43.5.2-installer.jar`**: El archivo existe y se descargó
- ❌ **Si NO existe**: No se descargó correctamente (problema en descarga o path)

#### ✓ Punto de control D: ¿ForgeWrapper.jar es el primer elemento?
```
[Rust] Classpath entries: 142
[Rust]   FIRST: C:\...\ForgeWrapper-prism-2025-12-07.jar
```
- ✅ **Si ForgeWrapper es el primero**: Classpath correcto
- ❌ **Si NO es el primero**: Classpath podría estar mal ordenado

#### ✓ Punto de control E: ¿Java se puede ejecutar?
Verifica que la ruta de Java es válida:
```
[Rust] Java: C:\Program Files\Java\jdk-17\bin\java.exe
```
Desde PowerShell:
```powershell
Test-Path "C:\Program Files\Java\jdk-17\bin\java.exe"
```
- ✅ **Si retorna `True`**: Java existe en esa ubicación
- ❌ **Si retorna `False`**: Java no está donde el launcher cree que está

### Paso 3: Capturar toda la salida

**Si el problema persiste, necesitamos ver TODA la salida de stderr de Java**. Haz esto:

1. Abre PowerShell en el directorio del launcher
2. Copia la línea de comando exacta de Rust (basada en los logs)
3. Ejecútala manualmente:

```powershell
# Ejemplo (reemplaza con tus rutas reales)
$java = "C:\Program Files\Java\jdk-17\bin\java.exe"
$args = @(
    "-Xmx2048m",
    "-Xms512m",
    "-Dforgewrapper.installer=C:/path/to/forge-1.19.2-43.5.2-installer.jar",
    "-cp",
    "C:\...\ForgeWrapper.jar;C:\...\lib1.jar;C:\...\client.jar",
    "io.github.zekerzhayard.forgewrapper.installer.Main",
    "--username", "Player",
    "--version", "1.19.2",
    "--gameDir", "C:\instances\TINKERS-CREATE",
    "--assetsDir", "C:\assets"
)

& $java $args 2>&1 | Tee-Object -FilePath "java_output.txt"
```

Esto capturará toda la salida en `java_output.txt` para análisis posterior.

## Escenarios Comunes de Error

### Escenario 1: "Unable to detect the forge installer!"
**Posibles causas**:
- ❌ Argumento `-Dforgewrapper.installer` no está presente
- ❌ La ruta contiene caracteres especiales sin escapar
- ❌ El instalador no fue descargado

**Soluciones**:
1. Verifica Punto A (argumento presente)
2. Verifica Punto C (archivo existe)
3. Si ambos son OK pero sigue fallando → necesitamos output de stdout/stderr completo

### Escenario 2: "File not found: installer.jar"
**Causa probable**: La ruta en el argumento no coincide con donde se descargó el archivo

**Soluciones**:
1. Verifica Punto B (ruta absoluta)
2. Verifica Punto C (archivo existe)
3. Compara la ruta del argumento con la ruta real del archivo

### Escenario 3: ClassNotFoundException en ForgeWrapper
**Causa probable**: ForgeWrapper está en el classpath pero sus dependencias no

**Soluciones**:
1. Verifica Punto D (ForgeWrapper es primero en classpath)
2. Asegúrate de que `mavenFiles` se descargaron (verificar en `libraries/` manually)
3. Comprueba que el perfil Forge tiene `formatVersion: 2`

## Próximos Pasos Basados en el Diagnóstico

Después de recolectar la salida de Rust:

1. **Si el argumento NO está presente**:
   - Revisa que la instancia es Forge (no vanilla)
   - Revisa que el mainClass del perfil contiene "forgewrapper"
   - Fuerza una reparación: Botón "Reinstall Forge" en settings

2. **Si la ruta está mal**:
   - Verifica que no hay caracteres especiales en la ruta de launcherDir
   - Intenta usar un forgeVersion más reciente (actualiza fallback tables)
   - Revisa que el profileId es correcto

3. **Si el archivo no existe**:
   - Verifica logs de descarga en consola
   - Comprueba conexión a internet (Prism Meta API)
   - Usa "Reinstall Forge" para re-descargar

## Información Útil para el Reporte

Cuando reportes el problema, incluye:

1. La sección completa `[Rust] ============ COMANDO DE LANZAMIENTO ============`
2. La versión de Minecraft y Forge
3. Tu directorio de launcher (para verificar rutas)
4. Output de `java -version`
5. Si es posible, la salida completa de stderr cuando ejecutas el comando manualmente
