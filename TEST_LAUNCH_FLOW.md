# Test Launch Flow - Debug Steps

## Objective
Test the complete launch flow in isolation to identify where the panic occurs.

## Step 1: Verify Prerequisites

```powershell
# Check Java exists
Test-Path "C:\Program Files\Java\jdk-17\bin\java.exe"

# Check game dir can be created
New-Item -ItemType Directory -Path "$env:APPDATA\Minecrack\test-launch" -ErrorAction SilentlyContinue
Test-Path "$env:APPDATA\Minecrack\test-launch"
```

## Step 2: Check Instance Configuration

Open browser DevTools (F12) and type:
```javascript
// Find the instance
const store = JSON.parse(localStorage.getItem('minecrack-store'));
const instance = store.instances.find(i => i.name.includes('TINKERS'));
console.log('Instance:', JSON.stringify(instance, null, 2));
console.log('Loader:', instance.loader);
console.log('LoaderVersion:', instance.loaderVersion);
console.log('Version:', instance.version);
```

Expected output:
```javascript
{
  id: "...",
  name: "TINKERS-CREATE",
  version: "1.19.2",
  loader: "forge",
  loaderVersion: "1.19.2-43.5.0",
  ...
}
```

If `loaderVersion` is just "43.5.0", that's still wrong. It should be "1.19.2-43.5.0".

## Step 3: Check Libraries Exist

```powershell
# Check if Forge profile exists
Test-Path "$env:APPDATA\Minecrack\versions\1.19.2-43.5.0\1.19.2-43.5.0.json"

# Check if installer JAR exists
Test-Path "$env:APPDATA\Minecrack\libraries\net\minecraftforge\forge\1.19.2-43.5.0\forge-1.19.2-43.5.0-installer.jar"

# Check ForgeWrapper JAR exists
Get-ChildItem "$env:APPDATA\Minecrack\libraries\io\github\zekerzhayard\forgewrapper\" -Recurse -Filter "*.jar"
```

All should return `True`.

## Step 4: Monitor the Dev Server Terminal

Before clicking Play:

1. **Look at the terminal** where `npm run dev` is running
2. Scroll up to see all messages
3. Prepare to capture any error messages

When you click Play, watch for:
```
[Rust] ============ COMANDO DE LANZAMIENTO ============
[Rust] Java: ...
[Rust] ✓ Intentando lanzar Java con XXX argumentos...
```

Then either:
- **Success**: `✓ Java lanzado exitosamente`
- **Failure**: `thread 'main' panicked at ...` or an error message

## Step 5: Capture the Error

If you see a panic or error:

1. **Copy the entire terminal output** (Ctrl+A, Ctrl+C)
2. **Paste into a file or send directly**
3. Look specifically for:
   - `panicked at ...`
   - `error: ...`
   - `Fatal: ...`

## Possible Errors and Solutions

### Error: "Java not found"
```
[Rust] Java no encontrado en: C:\Program Files\...
```
**Fix**: Update Java path in app or use auto-detect.

### Error: "Cannot create game_dir"
```
[Rust] No se pudo crear game_dir: Permission denied
```
**Fix**: Run app as Administrator or change game directory.

### Error: "Argument line too long"
```
[Rust] Total de caracteres en argumentos: 45000 bytes
```
**Fix**: Reduce classpath or number of JVM args (unlikely at this stage).

### Error: "No such file or directory"
```
Error spawning java: No such file or directory (os error 2)
```
**Cause**: Java path includes spaces or special characters not properly escaped.
**Fix**: Check Java path doesn't have special characters.

### Panic: Thread panicked
```
thread 'main' panicked at 'index out of bounds: the len is 5 but the index is 10'
```
**Cause**: Code is accessing an array beyond its bounds.
**Fix**: Send me the file:line reference for exact fix.

## What's Being Tested

The launch flow tests:
1. ✓ Instance data is loaded correctly
2. ✓ Java path is valid
3. ✓ Game directory exists/can be created
4. ✓ Classpath has all required JARs
5. ✓ JVM arguments are formatted correctly
6. ✓ Game arguments are present and valid
7. ✓ Java process can spawn
8. ✓ Java stdout/stderr can be read

If any step fails, it should return a readable error instead of a panic.

## Running Without the UI

If you want to test purely in Rust without the browser:

```bash
cd D:\Proyectos_Desarrollo\Minecrack\src-tauri

# Add this test in lib.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_launch_game() {
        let config = LaunchConfig {
            java_path: "C:\\Program Files\\Java\\jdk-17\\bin\\java.exe".to_string(),
            jvm_args: vec!["-Xmx2048m".to_string()],
            classpath: "test.jar".to_string(),
            main_class: "net.minecraft.client.main.Main".to_string(),
            game_args: vec!["--username".to_string(), "Player".to_string()],
            game_dir: "C:\\Temp\\test-game".to_string(),
        };
        
        // This would test the function directly
        // let result = launch_game(window, config).await;
    }
}

# Run: cargo test test_launch_game
```

## Summary

Once you have the exact error message, we can pinpoint and fix it immediately. The new diagnostics will give us all the information needed.

