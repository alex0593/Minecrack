/**
 * minecraft-jar-repair.js — Auto-repair for missing/corrupt Minecraft client JAR
 * ForgeWrapper needs the minecraft.jar to install Forge
 */

import { fileExists, downloadFile, ensureDir } from './tauri';
import { downloadQueue } from './downloader';
import { LAUNCHER } from '../config';

/**
 * Get the path where minecraft.jar should be located
 */
export function getClientJarPath(launcherDir, version) {
  return `${launcherDir}/libraries/net/minecraft/client/${version}/client-${version}.jar`;
}

/**
 * Validate minecraft.jar exists and has correct size
 */
export async function validateMinecraftJar(jarPath) {
  try {
    if (!(await fileExists(jarPath))) {
      return { valid: false, reason: 'JAR file not found', path: jarPath };
    }
    return { valid: true, path: jarPath };
  } catch (err) {
    return { valid: false, reason: err.message };
  }
}

/**
 * Auto-repair: Download missing minecraft.jar
 */
export async function autoRepairMinecraftJar(version, versionData, launcherDir, onProgress) {
  const repairLog = [];

  const log = (msg) => {
    console.log(`[MinecraftJarRepair] ${msg}`);
    repairLog.push(msg);
    onProgress?.({ phase: 'jar', message: msg });
  };

  try {
    log(`Starting Minecraft JAR auto-repair for ${version}`);

    // Get download URL from versionData
    if (!versionData?.downloads?.client?.url) {
      throw new Error('No download URL found in version data');
    }

    const jarPath = getClientJarPath(launcherDir, version);
    const downloadUrl = versionData.downloads.client.url;
    const expectedSha1 = versionData.downloads.client.sha1;
    const fileSize = versionData.downloads.client.size;

    // Create directory before downloading
    log(`Step 1: Creating directory...`);
    try {
      const dir = jarPath.substring(0, jarPath.lastIndexOf('/'));
      await ensureDir(dir);
      log(`✓ Directory ready: ${dir}`);
    } catch (err) {
      log(`⚠️ Warning creating directory: ${err.message}`);
    }

    log(`Step 2: Downloading Minecraft ${version} client JAR...`);
    log(`URL: ${downloadUrl}`);
    log(`Expected size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    // Download with progress tracking
    log(`Downloading client JAR...`);
    await downloadFile(downloadUrl, jarPath, expectedSha1, `client-${version}.jar`);
    log(`✓ Download completed`);

    log(`Step 3: Validating downloaded JAR...`);
    const validation = await validateMinecraftJar(jarPath);

    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.reason}`);
    }

    log(`✅ Minecraft JAR repair successful: ${jarPath}`);
    return { success: true, jarPath, repaired: true };
  } catch (err) {
    const errorMsg = `❌ Minecraft JAR repair failed: ${err.message}`;
    log(errorMsg);
    return { success: false, error: err.message, log: repairLog };
  }
}

/**
 * Pre-launch check for Minecraft JAR
 * Runs before game launch to ensure JAR exists
 */
export async function prelaunchMinecraftJarCheck(version, versionData, launcherDir, onRepair) {
  try {
    const jarPath = getClientJarPath(launcherDir, version);
    const validation = await validateMinecraftJar(jarPath);

    if (!validation.valid) {
      console.warn(`[MinecraftJarCheck] Minecraft JAR not found: ${validation.reason}`);
      console.log(`[MinecraftJarCheck] Attempting automatic download...`);

      const repair = await autoRepairMinecraftJar(version, versionData, launcherDir, onRepair);
      if (repair.success) {
        return repair.jarPath;
      } else {
        throw new Error(`Auto-repair failed: ${repair.error}`);
      }
    }

    return jarPath;
  } catch (err) {
    console.error(`[MinecraftJarCheck] Fatal error:`, err);
    throw err;
  }
}

/**
 * Generate repair report
 */
export function generateRepairReport(result) {
  if (!result) return '';

  let report = `\n${'='.repeat(60)}\n`;
  report += `Minecraft JAR Repair Report\n`;
  report += `${'='.repeat(60)}\n`;
  report += `Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}\n`;
  report += `Repaired: ${result.repaired ? 'Yes' : 'No'}\n`;

  if (result.jarPath) {
    report += `JAR Path: ${result.jarPath}\n`;
  }

  if (result.log && result.log.length > 0) {
    report += `\nLog:\n`;
    result.log.forEach((line) => {
      report += `  ${line}\n`;
    });
  }

  if (result.error) {
    report += `\nError: ${result.error}\n`;
  }

  report += `${'='.repeat(60)}\n`;
  return report;
}

export default {
  getClientJarPath,
  validateMinecraftJar,
  autoRepairMinecraftJar,
  prelaunchMinecraftJarCheck,
  generateRepairReport,
};
