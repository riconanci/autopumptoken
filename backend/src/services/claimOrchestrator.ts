import { log } from '../lib/logger';
import { validateFeesForClaim } from './feeMonitor';
import { claimCreatorFees } from './feeClaim';
import { transferToTreasury } from './treasury';
import { buybackTokens } from './buyback';
import { burnPurchasedTokens } from './burn';
import { getClaimById, getBuybackById } from '../db/queries';
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
    const estimatedAmount = await validateFeesForClaim(force);
    log.info(`✓ Fees validated: ${estimatedAmount} SOL (estimated)`, { force });

    // Step 2: Claim fees from Pump.fun
    // IMPORTANT: This now checks actual balance change and reserves gas
    log.info('[STEP 2/5] Claiming creator fees from Pump.fun...');
    const claimResult = await claimCreatorFees(estimatedAmount);
    
    if (!claimResult.success) {
      throw new Error(`Fee claim failed: ${claimResult.error}`);
    }
    
    log.info(`✓ Fees claimed: ${claimResult.claimedAmount} SOL (actual)`, {
      signature: claimResult.signature,
      estimated: estimatedAmount,
      actual: claimResult.claimedAmount,
    });

    // Get the claim ID from database for linking child records
    const claimRecord = await getClaimById(1); // This should query by signature
    const claimId = claimRecord?.id || 1;

    // Step 3: Transfer to treasury
    log.info('[STEP 3/5] Transferring to treasury wallet...');
    const treasurySignature = await transferToTreasury(claimResult.treasuryAmount);
    log.info(`✓ Treasury transfer complete: ${claimResult.treasuryAmount} SOL`, {
      signature: treasurySignature,
    });

    // Step 4: Buyback tokens
    log.info('[STEP 4/5] Buying back tokens...');
    log.info(`Using EXACTLY ${claimResult.buybackAmount} SOL for buyback (not all wallet balance)`);
    
    const buybackResult = await buybackTokens(
      claimId,
      claimResult.buybackAmount
    );
    
    if (!buybackResult.success) {
      throw new Error(`Buyback failed: ${buybackResult.error}`);
    }
    
    log.info(`✓ Buyback complete: ${buybackResult.tokensPurchased} tokens purchased`, {
      signature: buybackResult.signature,
      solSpent: buybackResult.solSpent,
    });

    // Get buyback ID for burn record
    const buybackRecord = await getBuybackById(1); // This should query by signature
    const buybackId = buybackRecord?.id || 1;

    // Step 5: Burn tokens
    log.info('[STEP 5/5] Burning purchased tokens...');
    const burnResult = await burnPurchasedTokens(
      buybackId,
      buybackResult.tokensPurchased.toString()
    );
    
    if (!burnResult.success) {
      throw new Error(`Burn failed: ${burnResult.error}`);
    }
    
    log.info(`✓ Burn complete: ${burnResult.tokensBurned} tokens permanently locked`, {
      signature: burnResult.signature,
    });

    // Calculate duration
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Prepare success result
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

    log.info('='.repeat(60));
    log.info(`✅ CLAIM FLOW COMPLETE (${duration}s)`);
    log.info('='.repeat(60));
    log.info('Summary:', {
      claimed: `${result.claimedAmount} SOL`,
      treasury: `${result.treasuryAmount} SOL`,
      buyback: `${result.buybackAmount} SOL`,
      burned: `${result.tokensBurned} tokens`,
      duration: `${duration}s`,
    });
    log.info('='.repeat(60));

    // Send webhook notification if configured
    if (webhookUrl) {
      try {
        await axios.post(webhookUrl, {
          event: 'claim_complete',
          ...result,
        });
        log.info('Webhook notification sent');
      } catch (error) {
        log.warn('Failed to send webhook notification', { error });
      }
    }

    return result;
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log.error('='.repeat(60));
    log.error(`✗ CLAIM FLOW FAILED (${duration}s)`, { error: errorMessage });
    log.error('='.repeat(60));

    // Send failure webhook if configured
    if (webhookUrl) {
      try {
        await axios.post(webhookUrl, {
          event: 'claim_failed',
          error: errorMessage,
          timestamp: Date.now(),
        });
      } catch (webhookError) {
        log.warn('Failed to send failure webhook', { error: webhookError });
      }
    }

    return {
      success: false,
      claimedAmount: 0,
      treasuryAmount: 0,
      buybackAmount: 0,
      tokensBurned: '0',
      error: errorMessage,
      timestamp: Date.now(),
    };
  }
}