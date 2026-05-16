/**
 * java-repair.js — Auto-repair script for Java installation
 * Detects and fixes Java installation problems automatically
 */

import { tauriCmd } from './tauri';

/**
 * Validate Java installation integrity
 * Tests if Java executable is working properly
 */
export async function validateJavaInstallation(javaPath) {
  if (!javaPath) {
    return { valid: false, reason: 'Java path is empty' };
  }

  try {
    // Use Tauri command to validate Java (Tauri converts snake_case to camelCase for JS)
    const result = await tauriCmd('validate_java', { javaPath });
    return { valid: result.valid, reason: result.reason || '', version: result.version || '' };
  } catch (err) {
    return { valid: false, reason: err.message || 'Validation failed' };
  }
}

/**
 * Attempt to repair broken Java installation
 * Removes corrupted installation and downloads fresh copy
 */
export async function autoRepairJava(requiredVersion, launcherDir, onProgress) {
  const repairLog = [];

  const log = (msg) => {
    console.log(`[JavaRepair] ${msg}`);
    repairLog.push(msg);
    onProgress?.({ phase: 'repair', message: msg });
  };

  try {
    log(`Starting Java auto-repair (required: ${requiredVersion})`);

    // Step 1: Validate existing Java
    log('Step 1: Checking system Java installations...');
    const javaPaths = await tauriCmd('detect_java', { launcherDir });

    if (javaPaths.length > 0) {
      for (const java of javaPaths) {
        const validation = await validateJavaInstallation(java.path);
        if (validation.valid && java.major_version >= requiredVersion) {
          log(`✅ Found valid Java ${java.major_version} at ${java.path}`);
          return { success: true, javaPath: java.path, repaired: false };
        }
      }
    }

    // Step 2: Clean corrupted installation in launcher directory
    log('Step 2: Cleaning corrupted Java installation...');
    try {
      await tauriCmd('clean_directory', {
        path: `${launcherDir}/runtimes`
      });
      log(`✅ Cleaned launcher Java directory`);
    } catch (err) {
      log(`⚠️ Could not clean directory: ${err.message}`);
    }

    // Step 3: Download fresh Java
    log(`Step 3: Downloading Java ${requiredVersion}...`);
    const javaExePath = await tauriCmd('install_java_runtime', {
      majorVersion: requiredVersion,
      launcherDir: launcherDir,
    });

    if (!javaExePath) {
      throw new Error('Java download returned empty path');
    }

    // Step 4: Validate repaired installation
    log('Step 4: Validating repaired installation...');
    const validation = await validateJavaInstallation(javaExePath);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.reason}`);
    }

    log(`✅ Java repair successful: ${javaExePath}`);
    return { success: true, javaPath: javaExePath, repaired: true };
  } catch (err) {
    const errorMsg = `❌ Java repair failed: ${err.message}`;
    log(errorMsg);
    return { success: false, error: err.message, log: repairLog };
  }
}

/**
 * Generate Java repair report
 */
export function generateRepairReport(result) {
  if (!result) return '';

  let report = `\n${'='.repeat(60)}\n`;
  report += `Java Auto-Repair Report\n`;
  report += `${'='.repeat(60)}\n`;
  report += `Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}\n`;
  report += `Repaired: ${result.repaired ? 'Yes' : 'No'}\n`;

  if (result.javaPath) {
    report += `Java Path: ${result.javaPath}\n`;
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
  validateJavaInstallation,
  autoRepairJava,
  generateRepairReport,
};
