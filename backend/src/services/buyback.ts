import { pumpFunAPI } from '../lib/pumpfun';
import { keypairFromSecret, solToLamports, getExplorerUrl } from '../lib/solana';
import { log } from '../lib/logger';
import { creatorWalletSecret, tokenMint, slippageBps } from '../env';
import { insertBuyback, updateBuybackStatus } from '../db/queries';
import { BuybackResult } from '../types';

/**
 * Buy tokens from Pump.fun bonding curve
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

    // Buy tokens via PumpPortal
    const { signature, tokensPurchased } = await pumpFunAPI.buyToken(
      tokenMint,
      amountSol,
      creatorKeypair,
      slippageBps
    );

    const explorerUrl = getExplorerUrl(signature);

    log.buyback('Buyback transaction confirmed', {
      signature,
      tokensPurchased,
      amountSol,
      explorerUrl,
    });

    // Record buyback in database
    buybackId = await insertBuyback(
      claimId,
      signature,
      tokensPurchased,
      solToLamports(amountSol)
    );

    // Update status to confirmed
    await updateBuybackStatus(buybackId, 'confirmed');

    const result: BuybackResult = {
      success: true,
      signature,
      tokensPurchased: Number(tokensPurchased),
      solSpent: amountSol,
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