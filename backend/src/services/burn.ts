import { PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import { burnTokens, keypairFromSecret, getExplorerUrl, connection } from '../lib/solana';
import { log } from '../lib/logger';
import { creatorWalletSecret, tokenMint, burnAddress } from '../env';
import { insertBurn, updateBurnStatus } from '../db/queries';
import { BurnResult } from '../types';

/**
 * Burn tokens by sending to incinerator address
 * 
 * CRITICAL: Token amounts from buyback are in DISPLAY format (with decimals).
 * We must convert to RAW format by multiplying by 10^decimals.
 * 
 * Example:
 * - Display: 194,000 tokens
 * - Decimals: 6
 * - Raw: 194,000,000,000 (194000 × 10^6)
 */
export async function burnPurchasedTokens(
  buybackId: number,
  tokenAmount: string
): Promise<BurnResult> {
  const creatorKeypair = keypairFromSecret(creatorWalletSecret);
  const mintPubkey = new PublicKey(tokenMint);
  let burnId: number | undefined;

  try {
    log.burn('Starting token burn', {
      buybackId,
      tokenAmount,
      mint: tokenMint,
      incinerator: burnAddress,
    });

    // Parse the display amount
    const displayAmount = parseFloat(tokenAmount);
    
    if (isNaN(displayAmount) || displayAmount <= 0) {
      throw new Error(`Invalid token amount: ${tokenAmount}`);
    }

    // Get token mint info to determine decimals
    const mintInfo = await getMint(connection, mintPubkey);
    const decimals = mintInfo.decimals;

    log.burn('Token mint info retrieved', {
      mint: tokenMint,
      decimals,
      displayAmount,
    });

    // Convert display amount to raw amount
    // Example: 194000 display tokens with 6 decimals = 194000000000 raw
    const rawAmount = Math.floor(displayAmount * Math.pow(10, decimals));
    const amount = BigInt(rawAmount);

    log.burn('Token amount converted from display to raw', {
      displayAmount,
      decimals,
      rawAmount: rawAmount.toString(),
      calculation: `${displayAmount} × 10^${decimals} = ${rawAmount}`,
    });

    // Burn tokens (send to incinerator)
    const signature = await burnTokens(
      creatorKeypair,
      mintPubkey,
      amount
    );

    const explorerUrl = getExplorerUrl(signature);

    log.burn('Burn transaction confirmed', {
      signature,
      displayAmount,
      rawAmount: rawAmount.toString(),
      explorerUrl,
    });

    // Record burn in database (store display amount string for precision)
    burnId = await insertBurn(buybackId, signature, tokenAmount);

    // Update status to confirmed
    await updateBurnStatus(burnId, 'confirmed');

    const result: BurnResult = {
      success: true,
      signature,
      tokensBurned: displayAmount,
      timestamp: Date.now(),
    };

    log.burn('Burn recorded in database', { 
      burnId, 
      buybackId, 
      tokensBurned: displayAmount,
      rawAmount: rawAmount.toString(),
    });

    return result;
  } catch (error) {
    log.error('Burn failed', error, {
      buybackId,
      tokenAmount,
      mint: tokenMint,
    });

    if (burnId) {
      await updateBurnStatus(
        burnId,
        'failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    return {
      success: false,
      tokensBurned: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    };
  }
}

/**
 * Get total tokens burned (from database)
 */
export async function getTotalTokensBurned(): Promise<string> {
  try {
    const { getSystemStats } = await import('../db/queries');
    const stats = await getSystemStats();
    return stats.totalTokensBurned;
  } catch (error) {
    log.error('Failed to get total tokens burned', error);
    return '0';
  }
}

/**
 * Verify burn address is the Solana incinerator
 */
export function verifyBurnAddress(): boolean {
  const expectedAddress = '1nc1nerator11111111111111111111111111111111';
  
  if (burnAddress !== expectedAddress) {
    log.warn('Burn address mismatch', {
      configured: burnAddress,
      expected: expectedAddress,
    });
    return false;
  }
  
  return true;
}