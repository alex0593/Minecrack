# Test: Forge Version Parsing Fix

## What Was Fixed

The Rust code that parses CurseForge modpack manifests now correctly formats the Forge loader version to include the Minecraft version.

**Example**:
- Manifest has: `"forge-43.5.0"` for MC `"1.19.2"`
- After fix: Returns `loader_version = "1.19.2-43.5.0"` ✓
- Before fix: Returned `loader_version = "43.5.0"` ❌

## Testing the Fix

### Step 1: Import a Forge Modpack

1. Open Minecrack launcher
2. Go to **Modpacks** tab
3. Search for a CurseForge modpack with Forge (e.g., "Sky Factory", "Create Above and Beyond")
4. Click on a Forge modpack
5. In the modal, select a version
6. Click **Download & Install**
7. Wait for installation to complete

### Step 2: Verify the Version Format

After importing, check that the loader version was stored correctly:

**Option A: Check the instances.json file**
```bash
# Windows PowerShell:
$content = Get-Content "$env:APPDATA\Minecrack\instances.json" | ConvertFrom-Json
$content[0] | Select-Object loader, loaderVersion
```

Expected output:
```
loader       loaderVersion
------       -------
forge        1.19.2-43.5.0    ← Should include MC version!
```

❌ **BUG** (old behavior): Would show `loaderVersion: "43.5.0"`
✅ **FIXED** (new behavior): Shows `loaderVersion: "1.19.2-43.5.0"`

**Option B: Check via browser console**
1. Open the app
2. Press `F12` for developer console
3. Type:
```javascript
JSON.parse(localStorage.getItem('minecrack-store'))?.instances[0]?.loaderVersion
```

Expected: `"1.19.2-43.5.0"` (or similar full version)

### Step 3: Launch the Instance

1. Find the imported modpack instance in the sidebar
2. Click **Play**
3. Observe the Rust logs in the terminal where you started Minecrack

Expected logs:
```
[Rust] ============ COMANDO DE LANZAMIENTO ============
[Rust]   [2] -Dforgewrapper.installer=C:/Users/ALEXIS/AppData/.../1.19.2-43.5.0/forge-1.19.2-43.5.0-installer.jar
[Rust]   [X] ¿Existe?: ✓ SÍ
```

❌ **BUG** (old behavior): Path would be `...43.5.0/forge-43.5.0-installer.jar` and file wouldn't exist
✅ **FIXED** (new behavior): Path includes MC version and file exists

### Step 4: Verify File Download

Check that the installer JAR was downloaded to the correct location:

```powershell
# Check if installer exists
Test-Path "$env:APPDATA\Minecrack\libraries\net\minecraftforge\forge\1.19.2-43.5.0\forge-1.19.2-43.5.0-installer.jar"
```

Expected: `True` ✓

## Success Criteria

✅ **Instance loads with correct loader_version** (includes MC version)
✅ **Diagnostic logs show correct path** (includes MC version in path)
✅ **Installer file exists** at `libraries/net/minecraftforge/forge/{MC_VERSION}-{FORGE_VERSION}/...`
✅ **Game launches successfully** (ForgeWrapper finds installer)
✅ **No "Unable to detect the forge installer!" error**

## Troubleshooting

If the test fails:

### Issue: loaderVersion still shows just "43.5.0"

**Cause**: Rust code may not have recompiled

**Solution**:
1. Stop the dev server
2. Run: `cargo clean`
3. Run: `npm run dev`

### Issue: Path still wrong in logs

**Cause**: Possible JavaScript caching

**Solution**:
1. Clear browser cache (Ctrl+Shift+Delete)
2. Refresh the app (F5)

### Issue: Installer still not found

**Cause**: Multiple possible issues

**Solution**: Check step 3 logs and look for:
1. Is the argument present? If not, Java code issue
2. Is the path correct? If not, Rust path formatting issue
3. Does the file exist? If not, download issue

## Expected Test Results

| Test | Expected | Result |
|------|----------|--------|
| Import modpack | loaderVersion = full version | ✓/✗ |
| Check file path | Includes MC version | ✓/✗ |
| Launcher logs | `1.19.2-43.5.0` in path | ✓/✗ |
| Installer exists | File at correct path | ✓/✗ |
| Game launches | No installer error | ✓/✗ |

---

## Quick Test (No Modpack Required)

If you want to test without importing a modpack:

1. Manually create `{launcherDir}/instances.json` with:
```json
[{
  "id": "test-forge",
  "name": "Test Forge",
  "version": "1.19.2",
  "loader": "forge",
  "loaderVersion": "1.19.2-43.5.0"
}]
```

2. Try to launch the instance
3. Check the logs for correct path formatting

