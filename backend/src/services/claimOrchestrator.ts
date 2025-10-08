import { log } from '../lib/logger';
import { validateFeesForClaim } from './feeMonitor';
import { claimCreatorFees } from './feeClaim';
import { transferToTreasury } from './treasury';
import { buybackTokens } from './buyback';
import { burnPurchasedTokens } from './burn';
import { webhookUrl } from '../env';
import axios from 'axios';

export interface OrchestrationResult {
  success: boolean;
  claimSignature?: string;
  treasurySignature?: string;
  buybackSignature?: string;
  burnSignature?: string;
  claimedAmount: number;
  treasuryAmount: number;
  buybackAmount: number;
  tokensBurned: string;
  error?: string;
  timestamp: number;
}

/**
 * Execute complete claim-treasury-buyback-burn flow
 */
export async function executeClaimFlow(
  force: boolean = false
): Promise<OrchestrationResult> {
  const startTime = Date.now();

  try {
    log.info('='.repeat(60));
    log.info('Starting Auto Pump claim orchestration flow');
    log.info('='.repeat(60));

    // Step 1: Validate fees meet threshold
    log.info('[STEP 1/5] Validating claimable fees...');
    const claimableAmount = await validateFeesForClaim(force);
    log.info(`✓ Fees validated: ${claimableAmount} SOL`, { force });

    // Step 2: Claim fees from Pump.fun
    log.info('[STEP 2/5] Claiming creator fees from Pump.fun...');
    const claimResult = await claimCreatorFees(claimableAmount);
    
    if (!claimResult.success) {
      throw new Error(`Fee claim failed: ${claimResult.error}`);
    }
    
    log.info(`✓ Fees claimed: ${claimResult.claimedAmount} SOL`, {
      signature: claimResult.signature,
    });

    // Step 3: Transfer to treasury
    log.info('[STEP 3/5] Transferring to treasury wallet...');
    const treasurySignature = await transferToTreasury(claimResult.treasuryAmount);
    log.info(`✓ Treasury transfer complete: ${claimResult.treasuryAmount} SOL`, {
      signature: treasurySignature,
    });

    // Step 4: Buyback tokens
    log.info('[STEP 4/5] Buying back tokens...');
    const buybackResult = await buybackTokens(
      1, // This should be the actual claimId from database
      claimResult.buybackAmount
    );
    
    if (!buybackResult.success) {
      throw new Error(`Buyback failed: ${buybackResult.error}`);
    }
    
    log.info(`✓ Buyback complete: ${buybackResult.tokensPurchased} tokens purchased`, {
      signature: buybackResult.signature,
      solSpent: buybackResult.solSpent,
    });

    // Step 5: Burn tokens
    log.info('[STEP 5/5] Burning purchased tokens...');
    const burnResult = await burnPurchasedTokens(
      1, // This should be the actual buybackId from database
      buybackResult.tokensPurchased.toString()
    );
    
    if (!burnResult.success) {
      throw new Error(`Burn failed: ${burnResult.error}`);
    }
    
    log.info(`✓ Burn complete: ${burnResult.tokensBurned} tokens permanently locked`, {
      signature: burnResult.signature,
    });

    const result: OrchestrationResult = {
      success: true,
      claimSignature: claimResult.signature,
      treasurySignature,
      buybackSignature: buybackResult.signature,
      burnSignature: burnResult.signature,
      claimedAmount: claimResult.claimedAmount,
      treasuryAmount: claimResult.treasuryAmount,
      buybackAmount: claimResult.buybackAmount,
      tokensBurned: burnResult.tokensBurned.toString(),
      timestamp: Date.now(),
    };

    const duration = (Date.now() - startTime) / 1000;
    log.info('='.repeat(60));
    log.info(`✓ CLAIM FLOW COMPLETE (${duration.toFixed(2)}s)`, result);
    log.info('='.repeat(60));

    // Send webhook notification if configured
    await sendWebhookNotification(result);

    return result;
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    log.error('='.repeat(60));
    log.error(`✗ CLAIM FLOW FAILED (${duration.toFixed(2)}s)`, error);
    log.error('='.repeat(60));

    const errorResult: OrchestrationResult = {
      success: false,
      claimedAmount: 0,
      treasuryAmount: 0,
      buybackAmount: 0,
      tokensBurned: '0',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    };

    // Send error notification
    await sendWebhookNotification(errorResult);

    return errorResult;
  }
}

/**
 * Send webhook notification (Discord/Slack)
 */
async function sendWebhookNotification(result: OrchestrationResult): Promise<void> {
  if (!webhookUrl) {
    return;
  }

  try {
    const message = result.success
      ? {
          content: `🔥 **Auto Pump - Claim Complete**\n\n` +
            `✅ Claimed: ${result.claimedAmount} SOL\n` +
            `💰 Treasury: ${result.treasuryAmount} SOL\n` +
            `🔄 Buyback: ${result.buybackAmount} SOL\n` +
            `🔥 Burned: ${result.tokensBurned} tokens\n\n` +
            `[View on Solscan](https://solscan.io/tx/${result.claimSignature})`,
        }
      : {
          content: `⚠️ **Auto Pump - Claim Failed**\n\n` +
            `Error: ${result.error}\n` +
            `Time: ${new Date(result.timestamp).toISOString()}`,
        };

    await axios.post(webhookUrl, message);
    log.debug('Webhook notification sent', { success: result.success });
  } catch (error) {
    log.error('Failed to send webhook notification', error);
  }
}