import { pumpFunAPI } from '../lib/pumpfun';
import { log } from '../lib/logger';
import { tokenMint, claimThresholdSol } from '../env';
import { insertMonitorCheck } from '../db/queries';
import { ClaimableFeesResponse, InsufficientFeesError } from '../types';

/**
 * Check claimable fees from Pump.fun bonding curve
 */
export async function checkClaimableFees(): Promise<ClaimableFeesResponse> {
  try {
    log.monitor('Checking claimable fees', { mint: tokenMint });

    const feesResponse = await pumpFunAPI.getClaimableFees(tokenMint);

    // Log the check to database
    await insertMonitorCheck(
      Math.floor(feesResponse.claimableFees * 1e9), // Convert to lamports
      Math.floor(claimThresholdSol * 1e9),
      feesResponse.claimableFees >= claimThresholdSol,
      `Claimable: ${feesResponse.claimableFees} SOL`
    );

    log.monitor('Fee check complete', {
      claimableFees: feesResponse.claimableFees,
      threshold: claimThresholdSol,
      meetsThreshold: feesResponse.claimableFees >= claimThresholdSol,
    });

    return feesResponse;
  } catch (error) {
    log.error('Fee check failed', error);
    throw error;
  }
}

/**
 * Check if fees meet threshold for claiming
 */
export async function shouldClaimFees(force: boolean = false): Promise<{
  shouldClaim: boolean;
  claimableFees: number;
  reason: string;
}> {
  try {
    const feesResponse = await checkClaimableFees();
    const { claimableFees } = feesResponse;

    if (force) {
      return {
        shouldClaim: true,
        claimableFees,
        reason: 'Manual force claim triggered',
      };
    }

    if (claimableFees < claimThresholdSol) {
      return {
        shouldClaim: false,
        claimableFees,
        reason: `Fees (${claimableFees} SOL) below threshold (${claimThresholdSol} SOL)`,
      };
    }

    return {
      shouldClaim: true,
      claimableFees,
      reason: `Fees (${claimableFees} SOL) meet threshold (${claimThresholdSol} SOL)`,
    };
  } catch (error) {
    log.error('Error checking if should claim fees', error);
    return {
      shouldClaim: false,
      claimableFees: 0,
      reason: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Get current claimable fees (simple check without database logging)
 */
export async function getCurrentClaimableFees(): Promise<number> {
  try {
    const feesResponse = await pumpFunAPI.getClaimableFees(tokenMint);
    return feesResponse.claimableFees;
  } catch (error) {
    log.error('Error getting current claimable fees', error);
    return 0;
  }
}

/**
 * Validate that fees are above threshold before claiming
 */
export async function validateFeesForClaim(force: boolean = false): Promise<number> {
  const decision = await shouldClaimFees(force);

  if (!decision.shouldClaim) {
    throw new InsufficientFeesError(
      decision.claimableFees,
      claimThresholdSol
    );
  }

  log.monitor('Fees validated for claim', {
    claimableFees: decision.claimableFees,
    reason: decision.reason,
  });

  return decision.claimableFees;
}