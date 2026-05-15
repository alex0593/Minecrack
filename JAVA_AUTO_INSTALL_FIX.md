# Java Auto-Install Validation Fix

## El Problema Exacto

Tenías razón al señalar el problema. El flujo era:

```
1. Detecta que no hay Java ✓
2. Intenta descargar Java automáticamente ✓
3. Pero SI LA DESCARGA FALLA → no lo detecta ✗
4. Continúa como si Java estuviese instalado ✗
5. Intenta ejecutar "java" sin ruta absoluta ✗
6. Rust no encuentra "java" en PATH ✗
7. Error: "No such file or directory"
```

## La Raíz: Validación Faltante

**Línea 114 antes (ROTO)**:
```javascript
const javaExePath = await installJavaRuntime(requiredMajor, launcherDir);
suitable = [{ path: javaExePath, major_version: requiredMajor }];
// ↑ Si javaExePath es undefined, sigue adelante igual
```

## La Solución Implementada

**Ahora (ARREGLADO)**:
```javascript
try {
  const javaExePath = await installJavaRuntime(requiredMajor, launcherDir);
  
  // ✓ VALIDACIÓN: Asegurar que la ruta es válida
  if (!javaExePath || typeof javaExePath !== 'string' || javaExePath.trim() === '') {
    throw new Error(`Descarga de Java retornó ruta inválida: "${javaExePath}"`);
  }
  
  suitable = [{ path: javaExePath, major_version: requiredMajor }];
  console.log(`✓ Java ${requiredMajor} descargado: ${javaExePath}`);
} catch (err) {
  // ✓ SI FALLA → error claro al usuario
  throw new Error(
    `No se pudo descargar Java ${requiredMajor}.\n` +
    `Causas: Sin internet, Adoptium API caída, sin espacio en disco\n` +
    `Solución: Instala Java 17+ manualmente`
  );
}
```

## Qué Cambió

### Antes:
- Descarga falla silenciosamente
- Código continúa como si nada
- `javaExePath` = undefined
- `suitable[0].path` = undefined
- `config.java_path` = undefined
- Rust intenta ejecutar "java" → falla

### Después:
- Si descarga falla → Error claro y específico
- Se detiene inmediatamente
- Usuario ve exactamente qué salió mal
- No continúa con rutas inválidas

## Por Qué Esto Importa

Como dijiste correctamente:
> "Para los launchers de Minecraft nunca debes confiar en usar solo 'java'. Siempre ruta absoluta."

Exacto. Ahora garantizamos:
1. ✅ O tenemos una ruta absoluta válida (descargada o detectada)
2. ✅ O lanzamos un error antes de intentar nada

No hay punto intermedio donde intentemos ejecutar "java" sin ruta.

## Cómo Testear

1. **Rebuild**:
   ```bash
   npm run dev
   ```

2. **Intenta lanzar sin Java instalado**:
   - Debería automaticamente intentar descargar
   - O mostrar error claro si falla

3. **Si descarga falla** (sin internet):
   - Verás: `No se pudo descargar Java 17. Causas: Sin internet...`
   - No continuará intentando lanzar

4. **Si descarga funciona**:
   - Verás: `✓ Java 17 descargado: /path/to/java.exe`
   - Juego se lanzará normalmente

## Stack Completo Ahora

```
[Launcher JS] detect_java() → lista de rutas
    ↓
[Launcher JS] Si vacía → installJavaRuntime()
    ↓
[Tauri Rust] install_java_runtime() → descarga de Adoptium
    ↓
[Launcher JS] Valida que retornó una ruta válida (NUEVO)
    ↓
[Launcher JS] Construye config con ruta absoluta
    ↓
[Tauri Rust] Valida que java.exe existe en esa ruta (MEJORADO)
    ↓
[Tauri Rust] Ejecuta Command::new(&config.java_path)
    ↓
Game launches ✓
```

## Ficheros Modificados

- `src/lib/launcher.js`: Mejor validación de descarga de Java

## Conclusión

El problema no era que usáramos "java" como string - el código siempre usó rutas absolutas. El problema era que **no validábamos si la descarga automática funcionaba**.

Ahora:
- Si Java no está → Se descarga automáticamente
- Si descarga falla → Error claro
- Si funciona → Ruta absoluta garantizada
- Rust valida que existe antes de ejecutar

Nunca llegamos al punto donde Rust intente ejecutar "java" sin ruta.

