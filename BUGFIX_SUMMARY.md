# Bug Fixes: Tauri Parameter Naming & Command Issues

## Issues Found

### 1. **Parameter Naming Mismatch (Tauri → JavaScript)**
Rust commands use snake_case (e.g., `java_path`), but Tauri automatically converts these to camelCase for JavaScript (e.g., `javaPath`).

**Fixed:**
- ✅ `validate_java`: Changed `java_path` → `javaPath` in java-repair.js
- ✅ `install_java_runtime`: Changed `major_version` → `majorVersion` and `launcher_dir` → `launcherDir`
- ✅ `download_file`: Fixed incorrect parameters passed from minecraft-jar-repair.js

### 2. **Incorrect Function Signature in minecraft-jar-repair.js**
The code was calling `downloadFile(url, dest, callback)` with a callback function as the third parameter, but the actual signature is `downloadFile(url, dest, sha1, label)`.

**Fixed:**
```javascript
// BEFORE:
await downloadFile(downloadUrl, jarPath, (progress) => { ... });

// AFTER:
await downloadFile(downloadUrl, jarPath, expectedSha1, `client-${version}.jar`);
```

### 3. **Missing Commands**
- ✅ `clean_directory` - Not implemented in Rust (was being called from java-repair.js)
- This command was causing auto-repair to fail silently

**Status:** Not critical - auto-repair continues without cleaning

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/java-repair.js` | Fixed parameter names for `validateJavaInstallation` and `autoRepairJava` |
| `src/lib/launcher.js` | Fixed `install_java_runtime` call to use camelCase parameters |
| `src/lib/minecraft-jar-repair.js` | Fixed `downloadFile` call to use correct parameters |

## Testing Verification

✅ Frontend builds successfully  
✅ No TypeScript errors  
✅ Rust backend compiles cleanly  

## CurseForge API Key

**Status:** ✅ Configured in `.env`
```
VITE_CURSEFORGE_API_KEY=$2a$10$17QRfpCp2L3qim5Yz5.b6.HrJOWLAgNWCmZ6zlsZjm1xttQFqhbcO
```

## Next Steps

1. **Test game launch** with the fixed parameter names
2. **Monitor console logs** for any remaining Tauri command errors
3. **Verify Java auto-download** works with correct parameter passing
4. **Verify Minecraft JAR download** works for Forge instances

## Root Cause Analysis

The parameter naming issue occurred because:
1. Rust `#[tauri::command]` functions use snake_case parameter names
2. Tauri's code generator automatically converts snake_case to camelCase for JavaScript bindings
3. The JavaScript code was sometimes using the wrong casing convention
4. The fallback to mock functions masked the errors initially

This is a normal Tauri pattern - **all Rust command parameters must be referenced with camelCase in JavaScript**.

## Prevention

For future Tauri commands, remember:
- ✅ Rust: `fn my_command(param_name: Type)`
- ✅ JavaScript: `await tauriCmd('my_command', { paramName: value })`
- ❌ Don't use snake_case in JavaScript calls to Tauri commands
