import cron from 'node-cron';
import { log } from './lib/logger';
import { checkIntervalMinutes, autoClaimEnabled } from './env';
import { shouldClaimFees } from './services/feeMonitor';
import { executeClaimFlow } from './services/claimOrchestrator';
import { getSystemStatus, updateSystemStatus } from './db/queries';
import { SchedulerStatus } from './types';

let schedulerStatus: SchedulerStatus = {
  isRunning: false,
  checksPerformed: 0,
  claimsTriggered: 0,
  errors: [],
};

let cronTask: cron.ScheduledTask | null = null;

// ========================================
// CLAIM LOCK - Prevents race conditions
// ========================================
let claimInProgress = false;

/**
 * Main monitoring task that runs every interval
 */
async function monitoringTask(): Promise<void> {
  try {
    schedulerStatus.lastCheckTime = Date.now();
    schedulerStatus.checksPerformed++;

    log.info(`[MONITOR] Check #${schedulerStatus.checksPerformed} started`);

    // Check if system is paused
    const systemStatus = await getSystemStatus();
    if (systemStatus.is_paused) {
      log.warn('[MONITOR] System is paused, skipping check');
      return;
    }

    // ✅ Check if claim already in progress
    if (claimInProgress) {
      log.info('[MONITOR] Claim already in progress, skipping this check');
      return;
    }

    // Update database with check timestamp
    await updateSystemStatus({
      lastCheckTimestamp: new Date(),
      totalChecks: schedulerStatus.checksPerformed,
    });

    // Check if we should claim fees
    const decision = await shouldClaimFees();

    if (!decision.shouldClaim) {
      log.info(`[MONITOR] No action needed: ${decision.reason}`);
      return;
    }

    if (!autoClaimEnabled) {
      log.info('[MONITOR] Auto-claim disabled, manual claim required', {
        claimableFees: decision.claimableFees,
      });
      return;
    }

    // ✅ Set lock before starting claim
    claimInProgress = true;
    log.info('[MONITOR] Setting claim lock - preventing concurrent operations');

    // Execute claim flow
    log.info('[MONITOR] Threshold met, triggering claim flow', {
      claimableFees: decision.claimableFees,
    });

    schedulerStatus.claimsTriggered++;

    const result = await executeClaimFlow();

    if (result.success) {
      await updateSystemStatus({
        totalClaims: schedulerStatus.claimsTriggered,
      });
      log.info('[MONITOR] Claim flow completed successfully');
    } else {
      throw new Error(result.error || 'Claim flow failed');
    }
  } catch (error) {
    const errorInfo = {
      timestamp: Date.now(),
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    };

    schedulerStatus.errors.push(errorInfo);

    // Keep only last 10 errors
    if (schedulerStatus.errors.length > 10) {
      schedulerStatus.errors.shift();
    }

    log.error('[MONITOR] Task failed', error);

    // Update database with error
    await updateSystemStatus({
      errorCount: (await getSystemStatus()).error_count + 1,
      lastError: errorInfo.message,
    });
  } finally {
    // ✅ Always clear lock in finally block
    if (claimInProgress) {
      claimInProgress = false;
      log.info('[MONITOR] Claim lock released');
    }

    schedulerStatus.nextCheckTime = Date.now() + checkIntervalMinutes * 60 * 1000;
    log.info(`[MONITOR] Next check in ${checkIntervalMinutes} minutes`);
  }
}

/**
 * Start the automated monitoring scheduler
 */
export function startScheduler(): void {
  if (cronTask) {
    log.warn('[SCHEDULER] Already running');
    return;
  }

  // Create cron expression (every N minutes)
  const cronExpression = `*/${checkIntervalMinutes} * * * *`;

  log.info('[SCHEDULER] Starting automated fee monitoring', {
    interval: `${checkIntervalMinutes} minutes`,
    autoClaimEnabled,
    cronExpression,
  });

  cronTask = cron.schedule(cronExpression, monitoringTask, {
    scheduled: true,
    timezone: 'UTC',
  });

  schedulerStatus.isRunning = true;
  schedulerStatus.nextCheckTime = Date.now() + checkIntervalMinutes * 60 * 1000;

  log.info('[SCHEDULER] Successfully started', {
    nextCheck: new Date(schedulerStatus.nextCheckTime).toISOString(),
  });

  // Run first check immediately (optional)
  if (autoClaimEnabled) {
    log.info('[SCHEDULER] Running initial check...');
    monitoringTask().catch((error) => {
      log.error('[SCHEDULER] Initial check failed', error);
    });
  }
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (!cronTask) {
    log.warn('[SCHEDULER] Not running');
    return;
  }

  cronTask.stop();
  cronTask = null;
  schedulerStatus.isRunning = false;

  log.info('[SCHEDULER] Stopped');
}

/**
 * Pause monitoring (via database flag)
 */
export async function pauseMonitoring(): Promise<void> {
  await updateSystemStatus({ isPaused: true });
  log.info('[SCHEDULER] Monitoring paused');
}

/**
 * Resume monitoring (via database flag)
 */
export async function resumeMonitoring(): Promise<void> {
  await updateSystemStatus({ isPaused: false });
  log.info('[SCHEDULER] Monitoring resumed');
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): SchedulerStatus {
  return { 
    ...schedulerStatus,
    claimInProgress, // ✅ Include lock status
  };
}

/**
 * Force a manual check (ignores pause state but respects claim lock)
 */
export async function forceCheck(): Promise<void> {
  if (claimInProgress) {
    log.warn('[SCHEDULER] Cannot force check - claim already in progress');
    throw new Error('Claim operation already in progress');
  }
  
  log.info('[SCHEDULER] Force check triggered');
  await monitoringTask();
}

/**
 * Get claim lock status (for debugging)
 */
export function isClaimInProgress(): boolean {
  return claimInProgress;
}