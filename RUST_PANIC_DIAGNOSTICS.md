# Diagnosing Rust Panic - IPC Error Resolution

## What's Happening

You're seeing:
```
ipc.localhost/launch_game:1  Failed to load resource: net::ERR_CONNECTION_REFUSED
VM9:106 IPC custom protocol failed...
```

This means the Rust backend crashed (panic) right when trying to execute the game launch command.

## How to Find the Panic Message

### Step 1: Kill any running processes
```powershell
# Stop the dev server
Get-Process | Where-Object { $_.ProcessName -like "*node*" -or $_.ProcessName -like "*npm*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
```

### Step 2: Start the dev server in a NEW terminal
```bash
cd D:\Proyectos_Desarrollo\Minecrack
npm run dev
```

**Important**: Watch this terminal window. Don't close it.

### Step 3: Try to launch the Forge instance again

1. Open the app in browser
2. Click Play on the TINKERS-CREATE instance
3. Watch the terminal closely

### Step 4: Find the panic message

In the terminal, you'll see output ending with something like:

```
[Rust] ✓ Agregada propiedad forgewrapper.installer=...
[Rust] ✓ Total de caracteres en argumentos: 8542 bytes
[Rust] ✓ Intentando lanzar Java con 145 argumentos...
thread 'main' panicked at 'index out of bounds: ...' or some other error message
   at src-tauri/src/lib.rs:XXX:YY
stack backtrace:
...
```

## Common Panic Causes

### 1. Index Out of Bounds
```
thread 'main' panicked at 'index out of bounds'
```
**Solution**: There's an array access error in Rust. Send me the full backtrace.

### 2. Unwrap on None
```
thread 'main' panicked at 'called `Option::unwrap()` on a `None` value'
```
**Solution**: A value expected to exist is None. Usually in parsing or file operations.

### 3. Unwrap on Error
```
thread 'main' panicked at 'called `Result::unwrap()` on an `Err` value'
```
**Solution**: An operation failed and we're unwrapping without handling the error.

### 4. UTF-8 Decode Error
```
thread 'main' panicked at 'called `Result::unwrap()` on an `Err` value: FromUtf8Error { ...'
```
**Solution**: Java output contains invalid UTF-8. Need to handle encoding.

### 5. Serialization Error
```
thread 'main' panicked at 'serde_json: ...`
```
**Solution**: The payload from JavaScript doesn't match the LaunchConfig struct.

## What to Send Me

Once you see the panic message, send:

```
1. The exact panic message line (from "thread 'main' panicked...")
2. The file:line reference (e.g., "src-tauri/src/lib.rs:403:15")
3. A screenshot or copy of the entire terminal output
```

## Immediate Fixes Applied

I've already added:
1. **Java path validation**: Checks if java.exe exists
2. **Game dir auto-creation**: Creates missing game directories
3. **Argument size validation**: Warns if command line is too long
4. **Better error messages**: More detailed error reporting instead of panics

Rebuild with:
```bash
cd D:\Proyectos_Desarrollo\Minecrack\src-tauri
cargo clean
cargo build
```

Then test again with `npm run dev`.

## Quick Debug Checklist

- [ ] Java path is valid (not a network path, not missing)
- [ ] Game dir can be created (not a protected folder)
- [ ] Classpath doesn't exceed ~32KB
- [ ] No special characters in paths that Java doesn't understand
- [ ] All game_args are valid UTF-8

## Next Steps

1. **Get the panic message** (most important)
2. **Share it with me**
3. **I'll provide the exact fix**

The new diagnostics will help pinpoint exactly what went wrong.

