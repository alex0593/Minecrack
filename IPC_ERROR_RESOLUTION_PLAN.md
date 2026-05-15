# IPC Error Resolution Plan

## Current Issue

```
ipc.localhost/launch_game:1  Failed to load resource: net::ERR_CONNECTION_REFUSED
```

**Meaning**: Rust backend crashed (panic) when trying to execute the game launch.

## What I've Done

### 1. ✅ Fixed Forge Version Path (COMPLETED)
- **File**: `src-tauri/src/lib.rs` (`parse_curseforge_manifest`)
- **Fix**: Now correctly formats loader version as `"1.19.2-43.5.0"` instead of `"43.5.0"`
- **Status**: Rust code compiles successfully

### 2. ✅ Added Robust Error Handling to launch_game
- **File**: `src-tauri/src/lib.rs` (`launch_game` function)
- **Improvements**:
  - Java path validation (checks if file exists)
  - Game directory auto-creation
  - Argument size validation
  - Better error messages instead of panics
  - Detailed diagnostic logging
- **Status**: Rust code compiles successfully

### 3. ✅ Removed Unsafe `.unwrap()` Calls
- **File**: `src-tauri/src/lib.rs` (verification logic)
- **Change**: Replaced `.unwrap()` with safe pattern matching
- **Status**: Rust code compiles successfully

## What You Need to Do Now

### Step 1: Rebuild Everything

```bash
cd D:\Proyectos_Desarrollo\Minecrack

# Kill old processes
Get-Process | Where-Object { $_.ProcessName -like "*node*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start fresh
npm run dev
```

### Step 2: Try to Launch Again

1. Open the browser (http://localhost:1420)
2. Click **Play** on the TINKERS-CREATE instance
3. **Watch the terminal** where `npm run dev` is running

### Step 3: Capture the Error

In the terminal, you'll see either:

#### ✅ Success:
```
[Rust] ✓ Java lanzado exitosamente, esperando salida...
[Rust] Java output: ...
```

#### ❌ Error (Specific):
```
[Rust] Java no encontrado en: ...
[Rust] Error: Permission denied
[Rust] Fatal: ...
```

#### ❌ Panic (What we're looking for):
```
thread 'main' panicked at '...'
   at src-tauri/src/lib.rs:XXX:YY
```

### Step 4: Send Me the Output

Copy the **entire terminal output** from the moment you clicked Play until the error appears.

## Diagnostic Checklist

Before clicking Play, verify:

```powershell
# 1. Java exists
Test-Path "C:\Program Files\Java\jdk-17\bin\java.exe"

# 2. Game directories can be created
New-Item -ItemType Directory -Path "$env:APPDATA\Minecrack\instances\test" -Force

# 3. Installer JAR exists (if already downloaded)
Test-Path "$env:APPDATA\Minecrack\libraries\net\minecraftforge\forge\1.19.2-43.5.0\forge-1.19.2-43.5.0-installer.jar"

# 4. Instance has correct loaderVersion (in browser console F12)
JSON.parse(localStorage.getItem('minecrack-store')).instances[0].loaderVersion
# Should output: "1.19.2-43.5.0" (not "43.5.0")
```

## Expected Behavior Timeline

1. **Before clicking Play**:
   - Terminal shows vite running on port 1420
   - React app loads in browser
   - Instance visible in sidebar

2. **Click Play**:
   - Browser shows "Launching..." or progress indicator
   - Terminal shows: `[Launcher] Invocando launch_game...`

3. **Rust processes the command**:
   - Terminal shows: `[Rust] ============ COMANDO DE LANZAMIENTO ============`
   - Shows all 145 arguments
   - Shows classpath with 95 entries
   - Diagnostic checks run

4. **Java spawns**:
   - Terminal shows: `[Rust] ✓ Java lanzado exitosamente`
   - Java begins loading Minecraft
   - Game window may appear (or stay headless)

5. **Success**:
   - Java loads and starts ForgeWrapper
   - ForgeWrapper finds installer JAR
   - Forge installation proceeds
   - Minecraft window opens

## Possible Outcomes and Fixes

| Scenario | Output | Fix |
|----------|--------|-----|
| Java not found | `Java no encontrado en: ...` | Update Java path or reinstall JDK |
| Permission denied | `Permission denied` | Run as Administrator |
| Game dir creation failed | `No se pudo crear game_dir` | Check folder permissions |
| Argument line too long | `Argumentos > 32000 bytes` | Reduce JVM args |
| Panic with unknown cause | `thread 'main' panicked at ...` | Send full output for diagnosis |
| Game launches | No error, Minecraft opens | ✅ SUCCESS! |

## If You Get a Panic

Don't panic 😄. Just:

1. Copy the **entire terminal output**
2. Send it to me
3. I'll identify the exact line and fix it

The new error handling will tell us exactly what's wrong.

## Files Modified This Session

1. `src-tauri/src/lib.rs`:
   - `parse_curseforge_manifest()`: Fixed Forge version formatting
   - `launch_game()`: Added robust error handling
   - Verification logic: Removed unsafe unwrap()

2. Documentation created:
   - `FORGE_VERSION_FIX.md`: Explains the version path fix
   - `RUST_PANIC_DIAGNOSTICS.md`: How to find panic messages
   - `TEST_LAUNCH_FLOW.md`: Step-by-step testing
   - `IPC_ERROR_RESOLUTION_PLAN.md`: This document

## Next Steps After Diagnosis

Once we identify the exact error:
1. **Fix it** in `lib.rs`
2. **Recompile** with `cargo check`
3. **Test again** with `npm run dev`
4. **Verify** the game launches

Then proceed to Phase 4 improvements (skins, modpack modal, etc.).

---

**TL;DR**: Rebuild, try launching, send me the terminal output, and we'll fix the exact issue.

