import { pumpFunAPI } from '../lib/pumpfun';
import { keypairFromSecret, solToLamports, getExplorerUrl } from '../lib/solana';
import { log } from '../lib/logger';
import { creatorWalletSecret, tokenMint, slippageBps } from '../env';
import { insertBuyback, updateBuybackStatus } from '../db/queries';
import { BuybackResult } from '../types';
import { connection } from '../lib/solana';

/**
 * Buy tokens from Pump.fun bonding curve
 * 
 * This function:
 * 1. Buys tokens with the specified SOL amount
 * 2. Records the buyback in the database
 * 3. Returns the database ID for linking to burn records
 */
export async function buybackTokens(
  claimId: number,
  amountSol: number
): Promise<BuybackResult> {
  const creatorKeypair = keypairFromSecret(creatorWalletSecret);
  let buybackId: number | undefined;

  try {
    log.buyback('Starting token buyback', {
      claimId,
      amountSol,
      mint: tokenMint,
      slippage: slippageBps,
    });

    // Get balance BEFORE buyback
    const balanceBefore = await connection.getBalance(creatorKeypair.publicKey);

    // Buy tokens via PumpPortal
    const { signature, tokensPurchased } = await pumpFunAPI.buyToken(
      tokenMint,
      amountSol,
      creatorKeypair,
      slippageBps
    );

    // Wait for transaction to finalize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get balance AFTER buyback
    const balanceAfter = await connection.getBalance(creatorKeypair.publicKey);

    // Calculate ACTUAL SOL spent (includes transaction fees)
    const actualSolSpent = (balanceBefore - balanceAfter) / 1e9;

    const explorerUrl = getExplorerUrl(signature);

    log.buyback('Buyback transaction confirmed', {
      signature,
      tokensPurchased,
      requestedAmount: amountSol,
      actualSpent: actualSolSpent,
      explorerUrl,
    });

    // Record buyback in database with ACTUAL amount spent
    buybackId = await insertBuyback(
      claimId,
      signature,
      tokensPurchased,
      solToLamports(actualSolSpent)  // Use actual spent, not requested
    );

    // Update status to confirmed
    await updateBuybackStatus(buybackId, 'confirmed');

    const result: BuybackResult = {
      success: true,
      signature,
      buybackId,  // ✅ CRITICAL: Return database ID for burn record linking
      tokensPurchased: Number(tokensPurchased),
      solSpent: actualSolSpent,  // Return actual spent
      timestamp: Date.now(),
    };

    log.buyback('Buyback recorded in database', { buybackId, claimId });

    return result;
  } catch (error) {
    log.error('Buyback failed', error, {
      claimId,
      amountSol,
      mint: tokenMint,
    });

    if (buybackId) {
      await updateBuybackStatus(
        buybackId,
        'failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    return {
      success: false,
      tokensPurchased: 0,
      solSpent: amountSol,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    };
  }
}

/**
 * Calculate expected tokens from buyback
 * This is an estimate based on current bonding curve price
 */
export async function estimateBuybackTokens(
  amountSol: number
): Promise<number> {
  try {
    const price = await pumpFunAPI.getTokenPrice(tokenMint);
    const estimatedTokens = amountSol / price;

    log.debug('Buyback estimate calculated', {
      amountSol,
      price,
      estimatedTokens,
    });

    return estimatedTokens;
  } catch (error) {
    log.error('Failed to estimate buyback tokens', error);
    return 0;
  }
}