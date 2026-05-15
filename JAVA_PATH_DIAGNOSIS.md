# Java Path Not Found - Diagnosis & Fix

## The Actual Problem

Your error is **NOT** a panic or IPC failure. It's a simple file system error:

```
Error spawning java: No such file or directory (os error 2)
```

This means:
1. Rust successfully received the command to launch Java
2. Rust tried to execute the Java binary at the path provided
3. But the file doesn't exist at that exact path

## Root Causes (In Order of Likelihood)

### 1. **Java is not installed** (Most Common)
You have NO Java installed on your system, or not the right version.

### 2. **Java path is wrong in detect_java**
The `detect_java` Rust command returned an incorrect path.

### 3. **Path encoding issues** (Windows)
The path uses forward slashes or special characters that Java doesn't understand.

### 4. **Auto-install of Java failed silently**
The code tried to download Java but it failed without throwing an error.

## How to Check Which Problem You Have

### Step 1: Check if Java is installed

```powershell
# Method 1: Check if java command works
java -version

# Method 2: Check common install locations
Test-Path "C:\Program Files\Java\jdk-17\bin\java.exe"
Test-Path "C:\Program Files\Java\jdk-21\bin\java.exe"
Test-Path "C:\Program Files (x86)\Java\jdk-17\bin\java.exe"

# Method 3: Search everywhere
Get-ChildItem -Path C:\ -Filter "java.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object FullName
```

**Result**:
- ✅ If `java -version` works: Java is in PATH
- ✅ If `Test-Path` returns True: Java is installed
- ✅ If search finds files: Java is installed somewhere

### Step 2: Rebuild and Check Console Logs

Now I've added **MUCH better logging**. Rebuild and try again:

```bash
cd D:\Proyectos_Desarrollo\Minecrack
npm run dev
```

Then click Play. In the **browser console** (F12), you'll now see:

```
[Launcher] ============ ENVIANDO CONFIGURACIÓN A RUST ============
[Launcher] java_path: C:\Program Files\Java\jdk-17\bin\java.exe
[Launcher] main_class: io.github.zekerzhayard.forgewrapper.installer.Main
[Launcher] game_dir: C:\...\TINKERS-CREATE
...
```

✅ If `java_path` shows a valid path → Problem is in Rust
❌ If `java_path` is empty or `undefined` → Problem is in JavaScript

### Step 3: Check the Rust Terminal Output

In the terminal where `npm run dev` is running, look for:

```
[Rust] Validando ruta de Java: C:\Program Files\Java\jdk-17\bin\java.exe
[Rust] ✓ Java validado: C:\Program Files\Java\jdk-17\bin\java.exe
[Rust] ✓ Intentando lanzar Java con 145 argumentos...
```

**If you see this**:
```
[Rust] FATAL: java_path está vacío
```
→ JavaScript detected no Java. Skip to "Solution 1".

**If you see this**:
```
[Rust] FATAL: Java no encontrado en: C:\Program Files\Java\jdk-17\bin\java.exe
```
→ The path is wrong or Java isn't installed there. Skip to "Solution 2".

## Solutions

### Solution 1: Java is NOT installed at all

**Quick Fix**:
1. Download JDK 17 from: https://www.oracle.com/java/technologies/downloads/#java17
2. Install it (default location is fine)
3. **RESTART YOUR COMPUTER** (to refresh PATH)
4. Try again

**Or download Java automatically**:
The code should auto-download Java if it detects it's missing. Check if it happens.

### Solution 2: Java is installed but path is wrong

This can happen if:
- You installed Java in a non-standard location
- You have multiple Java versions and detect_java picked the wrong one
- The path has encoding issues

**Quick Fix**:

Check exactly where Java is installed:
```powershell
Get-ChildItem -Path "C:\Program Files\Java\" -Directory | Select-Object Name
```

Output might be:
```
jdk-17.0.1
jdk-21.0.2
```

Then get the full path:
```powershell
Get-ChildItem "C:\Program Files\Java\jdk-17*\bin\java.exe"
```

Once you have the exact path, test it:
```powershell
& "C:\Program Files\Java\jdk-17.0.1\bin\java.exe" -version
```

**If that works**, the issue is that Minecrack's `detect_java` is returning a wrong path.

### Solution 3: Verify the fix I just applied

I added better logging. The new JavaScript code now:
1. ✅ Validates that `suitable` is not empty
2. ✅ Validates that `javaPath` is not undefined
3. ✅ **Logs the exact path** being sent to Rust

The new Rust code now:
1. ✅ Checks if `java_path` is empty
2. ✅ Checks if the file exists
3. ✅ Checks if it's actually a file
4. ✅ Gives detailed error messages

## Complete Diagnosis Flowchart

```
Does `java -version` work? 
  ├─ YES → Java is in PATH, problem is elsewhere
  └─ NO → Java not installed or not in PATH

Is Java installed somewhere?
  ├─ YES → Fix: Add to PATH or tell Minecrack where it is
  └─ NO → Fix: Install JDK 17+, restart computer

Browser console shows java_path correctly?
  ├─ YES → Problem is in Rust (rare, tell me what the error is)
  └─ NO → Problem is in JavaScript (detect_java returned wrong path)
```

## Testing After the Fix

1. Rebuild: `npm run dev`
2. Try to launch
3. Watch the **browser console** (F12) for `java_path` log
4. Watch the **terminal** for `[Rust]` validation logs
5. If Java works: Game should launch
6. If Java doesn't work: You'll see a clear error message

## What Changed in This Update

**JavaScript (`launcher.js`)**:
- Added validation that `suitable` array is not empty
- Added validation that `javaPath` is not undefined
- Added detailed logging of the exact `java_path` being sent

**Rust (`lib.rs`)**:
- Added check for empty `java_path`
- Added check for file existence
- Added check that it's actually a file (not a directory)
- Better error messages explaining what went wrong

## Next Steps

1. **Install Java if you don't have it** (most likely fix)
2. **Rebuild with new logging** (`npm run dev`)
3. **Try launching again**
4. **Share the exact error message** if it still fails

The new error messages will be MUCH more specific and helpful.

