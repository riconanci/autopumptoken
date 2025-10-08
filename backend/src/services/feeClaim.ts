import { Keypair } from '@solana/web3.js';
import { pumpFunAPI } from '../lib/pumpfun';
import { keypairFromSecret, lamportsToSol, solToLamports } from '../lib/solana';
import { log } from '../lib/logger';
import { 
  creatorWalletSecret, 
  tokenMint,
  treasuryPercent,
  buybackPercent 
} from '../env';
import { insertClaim, updateClaimStatus } from '../db/queries';
import { ClaimResult } from '../../../src/types';

/**
 * Claim creator fees from Pump.fun
 */
export async function claimCreatorFees(
  amountSol?: number
): Promise<ClaimResult> {
  const creatorKeypair = keypairFromSecret(creatorWalletSecret);
  let claimId: number | undefined;

  try {
    log.claim('Starting fee claim process', {
      mint: tokenMint,
      creator: creatorKeypair.publicKey.toBase58(),
      amount: amountSol,
    });

    // Claim fees from Pump.fun
    const signature = await pumpFunAPI.claimFees(
      tokenMint,
      creatorKeypair,
      amountSol
    );

    // Calculate the actual claimed amount
    // If no specific amount was requested, we need to check the transaction
    const claimedAmount = amountSol || 0; // This should be extracted from transaction

    // Calculate splits
    const treasuryAmount = (claimedAmount * treasuryPercent) / 100;
    const buybackAmount = (claimedAmount * buybackPercent) / 100;

    log.claim('Fees claimed successfully', {
      signature,
      claimedAmount,
      treasuryAmount,
      buybackAmount,
    });

    // Record claim in database
    claimId = await insertClaim(
      signature,
      solToLamports(claimedAmount),
      solToLamports(treasuryAmount),
      solToLamports(buybackAmount)
    );

    // Update status to confirmed
    await updateClaimStatus(claimId, 'confirmed');

    const result: ClaimResult = {
      success: true,
      signature,
      claimedAmount,
      treasuryAmount,
      buybackAmount,
      timestamp: Date.now(),
    };

    log.claim('Claim recorded in database', { claimId, signature });

    return result;
  } catch (error) {
    log.error('Fee claim failed', error, { mint: tokenMint });

    if (claimId) {
      await updateClaimStatus(
        claimId,
        'failed',
        undefined,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    return {
      success: false,
      claimedAmount: 0,
      treasuryAmount: 0,
      buybackAmount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    };
  }
}

/**
 * Get actual claimed amount from transaction signature
 * This is a helper to extract the real amount from the transaction
 */
export async function getClaimedAmountFromTransaction(
  signature: string
): Promise<number> {
  try {
    // TODO: Parse transaction to get actual claimed amount
    // This would involve checking the transaction logs and token balance changes
    
    log.debug('Extracting claimed amount from transaction', { signature });
    
    // Placeholder - implement actual transaction parsing
    return 0;
  } catch (error) {
    log.error('Failed to extract claimed amount from transaction', error, { signature });
    return 0;
  }
}