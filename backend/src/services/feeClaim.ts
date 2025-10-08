// backend/src/services/feeClaim.ts
import { Keypair, PublicKey } from '@solana/web3.js';
import { pumpFunAPI } from '../lib/pumpfun';
import { keypairFromSecret, lamportsToSol, solToLamports } from '../lib/solana';
import { connection } from '../lib/solana';
import { log } from '../lib/logger';
import { 
  creatorWalletSecret, 
  tokenMint,
  treasuryPercent,
  buybackPercent 
} from '../env';
import { insertClaim, updateClaimStatus } from '../db/queries';
import { ClaimResult } from '../types';

// Minimum SOL to keep in wallet for gas fees
// This is a safety check, not a deduction from rewards
const MIN_WALLET_BALANCE_SOL = 0.01;

/**
 * Claim creator fees from Pump.fun
 * 
 * IMPORTANT: 
 * - Splits ALL claimed rewards (doesn't deduct gas from rewards)
 * - Verifies wallet will maintain minimum balance for future gas
 * - Only adjusts if wallet would drop below minimum (rare)
 */
export async function claimCreatorFees(
  estimatedAmount?: number
): Promise<ClaimResult> {
  const creatorKeypair = keypairFromSecret(creatorWalletSecret);
  let claimId: number | undefined;

  try {
    log.claim('Starting fee claim process', {
      mint: tokenMint,
      creator: creatorKeypair.publicKey.toBase58(),
      estimatedAmount,
    });

    // Get balance BEFORE claim
    const balanceBefore = await connection.getBalance(creatorKeypair.publicKey);
    const solBefore = balanceBefore / 1e9;

    log.claim('Wallet balance before claim', {
      lamports: balanceBefore,
      sol: solBefore,
    });

    // Claim fees from Pump.fun (claims ALL accumulated fees)
    const signature = await pumpFunAPI.claimFees(
      tokenMint,
      creatorKeypair,
      estimatedAmount
    );

    // Wait a moment for balance to update
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get balance AFTER claim
    const balanceAfter = await connection.getBalance(creatorKeypair.publicKey);
    const solAfter = balanceAfter / 1e9;

    log.claim('Wallet balance after claim', {
      lamports: balanceAfter,
      sol: solAfter,
    });

    // Calculate ACTUAL claimed amount from balance change
    const claimedAmount = solAfter - solBefore;

    if (claimedAmount <= 0) {
      throw new Error(`No SOL received from claim. Balance change: ${claimedAmount}`);
    }

    log.claim('Actual claimed amount determined', {
      estimatedAmount,
      actualAmount: claimedAmount,
      difference: claimedAmount - (estimatedAmount || 0),
    });

    // Calculate splits from FULL claimed amount
    let treasuryAmount = (claimedAmount * treasuryPercent) / 100;
    let buybackAmount = (claimedAmount * buybackPercent) / 100;

    // Safety check: Verify wallet will maintain minimum balance after transfers
    const totalToSend = treasuryAmount + buybackAmount;
    const willRemain = solAfter - totalToSend;

    if (willRemain < MIN_WALLET_BALANCE_SOL) {
      log.warn('Wallet would drop below minimum balance, adjusting amounts', {
        currentBalance: solAfter,
        wouldSend: totalToSend,
        wouldRemain: willRemain,
        minRequired: MIN_WALLET_BALANCE_SOL,
      });

      // Adjust: Keep minimum balance, split the rest
      const availableToSend = Math.max(0, solAfter - MIN_WALLET_BALANCE_SOL);
      treasuryAmount = (availableToSend * treasuryPercent) / 100;
      buybackAmount = (availableToSend * buybackPercent) / 100;

      log.claim('Amounts adjusted to maintain minimum balance', {
        adjustedTreasury: treasuryAmount,
        adjustedBuyback: buybackAmount,
        willNowRemain: solAfter - treasuryAmount - buybackAmount,
      });
    }

    log.claim('Split calculation (from full claimed amount)', {
      claimedAmount,
      treasuryAmount,
      buybackAmount,
      totalSending: treasuryAmount + buybackAmount,
      willRemainInWallet: solAfter - treasuryAmount - buybackAmount,
      minBalanceCheck: willRemain >= MIN_WALLET_BALANCE_SOL ? 'PASS' : 'ADJUSTED',
    });

    // Verify split totals are valid
    if (treasuryAmount <= 0 || buybackAmount <= 0) {
      throw new Error(
        `Invalid split amounts: treasury=${treasuryAmount}, buyback=${buybackAmount}`
      );
    }

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

    log.claim('Claim recorded in database', { 
      claimId, 
      signature,
      claimedAmount,
      treasuryAmount,
      buybackAmount,
    });

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