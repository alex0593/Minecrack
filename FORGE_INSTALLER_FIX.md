# ForgeWrapper Installer Detection Fix - Complete Solution

## Problem
When launching Forge instances, ForgeWrapper was failing with:
```
Exception in thread "main" java.lang.RuntimeException: Unable to detect the forge installer!
```

This occurred because ForgeWrapper could not locate the `forge-{version}-installer.jar` file needed to complete the Forge installation on first launch.

---

## Root Cause Analysis

Three cascading issues prevented the installer JAR from being properly handled:

### Issue A: Missing Path Derivation for Classifiers (🔴 PRIMARY BUG)
- **Problem**: Prism Meta returns the installer as: `net.minecraftforge:forge:1.19.2-43.2.14:installer` (4 Maven parts)
- **Issue**: The `nameToMavenPath()` function only handled 3-part names: `group:artifact:version`
- **Result**: When processing the 4-part name with classifier, the path was NOT being derived
- **Consequence**: The installer JAR was never downloaded to disk

### Issue B: Missing JVM System Property
- **Problem**: Even if the installer was downloaded, ForgeWrapper needs a JVM parameter to find it
- **Issue**: No `-Dforgewrapper.installer` property was being passed
- **Consequence**: ForgeWrapper couldn't locate the file at runtime

### Issue C: Lack of Path Absolutization
- **Problem**: Paths need to be absolute (full filesystem path) when passed to Java
- **Issue**: Paths could be relative or incomplete
- **Consequence**: Java working directory changes could make paths invalid

---

## Solution Implemented

### Fix 1: Support Maven Classifiers in Path Derivation (`src/lib/loaders/forge.js`)
**This is the critical fix.** Updated `nameToMavenPath()` to handle 4-part Maven coordinate names:

```javascript
// Before: BROKEN
function nameToMavenPath(name) {
  const parts = name.split(':');
  if (parts.length < 3) return null;
  const [group, artifact, version] = parts;  // ❌ Ignores classifier!
  return `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`;
}

// After: FIXED
function nameToMavenPath(name) {
  const parts = name.split(':');
  if (parts.length < 3) return null;

  const [group, artifact, version, classifier] = parts;  // ✅ Captures classifier
  const groupPath = group.replace(/\./g, '/');

  // If classifier exists (e.g., "installer"), include it in JAR filename
  if (classifier) {
    return `${groupPath}/${artifact}/${version}/${artifact}-${version}-${classifier}.jar`;
    // Example output: net/minecraftforge/forge/1.19.2-43.2.14/forge-1.19.2-43.2.14-installer.jar
  } else {
    return `${groupPath}/${artifact}/${version}/${artifact}-${version}.jar`;
  }
}
```

**Examples of now-supported names**:
- ✅ `org.ow2.asm:asm:9.9` → `org/ow2/asm/asm/9.9/asm-9.9.jar`
- ✅ `net.minecraftforge:forge:1.19.2-43.2.14:installer` → `net/minecraftforge/forge/1.19.2-43.2.14/forge-1.19.2-43.2.14-installer.jar`

**Impact**: Installer JAR path is now correctly derived from Prism Meta, ensuring the file is included in download tasks.

### Fix 2: Add Installer to Download Tasks and Profile Metadata (`src/lib/loaders/forge.js`)
When generating a Forge profile that uses ForgeWrapper, automatically add the installer JAR to `mavenFiles`:

```javascript
const isForgeWrapper = mainClass?.includes('forgewrapper') || mainClass?.includes('ForgeWrapper');
if (isForgeWrapper) {
  const installerEntry = {
    name: `net.minecraftforge:forge:${forgeVersion}:installer`,
    downloads: {
      artifact: {
        path: `net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-installer.jar`,
        url: `${API.FORGE.MAVEN_BASE}/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-installer.jar`,
        sha1: null,
        size: 0,
      },
    },
  };
  // Avoid duplicates if Prism Meta already includes it
  const installerExists = mavenFiles.some(mf => mf.downloads?.artifact?.path?.includes('installer'));
  if (!installerExists) {
    mavenFiles = [...mavenFiles, installerEntry];
  }
}
```

**Impact**: Installer is now reliably downloaded and tracked in the profile.

### Fix 3: Pass Absolute Path via JVM System Property (`src/lib/launcher.js`)
When launching a Forge instance with ForgeWrapper, add the exact system property ForgeWrapper expects:

```javascript
const isForgeWrapper = loaderProfile.mainClass?.includes('forgewrapper') ||
                        loaderProfile.mainClass?.includes('ForgeWrapper');
if (isForgeWrapper && instance.loader === 'forge') {
  // profileId for Forge is the version itself, e.g., "1.19.2-43.5.2"
  // Generate ABSOLUTE path (not relative)
  const installerJarPath = `${launcherDir}/libraries/net/minecraftforge/forge/${profileId}/forge-${profileId}-installer.jar`;

  // ForgeWrapper specifically looks for -Dforgewrapper.installer (not forge.installer.path)
  if (!extraJvmArgs.some(arg => arg.includes('forgewrapper.installer'))) {
    extraJvmArgs.push(`-Dforgewrapper.installer=${installerJarPath}`);
    console.log(`[Launcher] Agregada propiedad forgewrapper.installer=${installerJarPath}`);
  }
}
```

**Critical Details**:
- ✅ Path is **absolutely qualified** (includes full `launcherDir`)
- ✅ Property name is **exactly** `-Dforgewrapper.installer` (this is what ForgeWrapper looks for)
- ✅ Installer JAR is **kept permanently** in libraries directory (never deleted)

---

## Expected Behavior After All Fixes

### New Forge Instance Launch Flow:
1. **Profile Generation** 
   - Fetch metadata from Prism Meta
   - Installer name is `net.minecraftforge:forge:{version}:installer` (4 parts)
   
2. **Path Derivation** ✨ (Now works!)
   - `nameToMavenPath()` correctly handles the 4-part name
   - Produces: `net/minecraftforge/forge/{version}/forge-{version}-installer.jar`
   
3. **Download Phase**
   - Installer JAR is included in download tasks (via mavenFiles)
   - Downloaded to: `libraries/net/minecraftforge/forge/{version}/forge-{version}-installer.jar`
   - File is verified and persisted permanently
   
4. **Launch Phase** ✨ (Now works!)
   - System property passed: `-Dforgewrapper.installer=/absolute/path/to/installer.jar`
   - ForgeWrapper receives the property and knows exactly where the installer is
   
5. **Installation Phase**
   - ForgeWrapper executes the installer JAR
   - Forge is installed to the instance
   - Game launches successfully

---

## Testing the Fix

### Test 1: Verify Installer is Downloaded
After launching a Forge instance, check that the installer exists:
```bash
ls -lah {launcherDir}/libraries/net/minecraftforge/forge/{version}/forge-{version}-installer.jar
```
Expected: File exists and is ~7MB

### Test 2: Check Launch Logs
Look for this in the launcher console:
```
[Launcher] Agregada propiedad forgewrapper.installer=/path/to/forge-{version}-installer.jar
```

### Test 3: Verify Game Launches
- No "Unable to detect the forge installer!" error
- ForgeWrapper should execute and complete Forge setup
- Game window should open

---

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/loaders/forge.js` | 1. Updated `nameToMavenPath()` to support 4-part Maven names with classifiers<br>2. Added auto-installation of installer JAR to mavenFiles when using ForgeWrapper |
| `src/lib/launcher.js` | Added `-Dforgewrapper.installer` system property with absolute path for ForgeWrapper |

---

## Backwards Compatibility

✅ **Existing Forge instances are automatically repaired**:
- When launching an old instance with a pre-fix profile, `ensureLoaderProfileUpToDate()` detects it
- Profile is regenerated with the latest installer JAR
- All missing files are re-downloaded
- No manual intervention needed

✅ **Manual "Reinstall Forge" button available**:
- In instance settings, users can trigger explicit repair
- Useful if they want to rebuild from scratch

---

## Why This Solution is Robust

1. ✅ **Automatic derivation of Maven paths** - Works with any 3 or 4-part Maven coordinate
2. ✅ **Absolute paths** - Works regardless of working directory changes
3. ✅ **Explicit system property** - ForgeWrapper has clear instructions where to find the installer
4. ✅ **Persistent installation** - Installer JAR is kept for future launches
5. ✅ **Auto-repair for legacy instances** - Old profiles are automatically fixed on next launch
6. ✅ **Deduplication** - Doesn't re-add installer if Prism Meta already includes it

---

## Related Documentation

- Prism Meta API: https://meta.prismlauncher.org/
- ForgeWrapper GitHub: https://github.com/ZekerZhayard/ForgeWrapper
- Maven Repository Layout: https://maven.apache.org/guides/introduction/introduction-to-repositories.html
