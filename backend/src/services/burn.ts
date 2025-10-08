import { PublicKey } from '@solana/web3.js';
import { burnTokens, keypairFromSecret, getExplorerUrl } from '../lib/solana';
import { log } from '../lib/logger';
import { creatorWalletSecret, tokenMint, burnAddress } from '../env';
import { insertBurn, updateBurnStatus } from '../db/queries';
import { BurnResult } from '../../../src/types';

/**
 * Burn tokens by sending to incinerator address
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

    // Convert token amount to bigint
    const amount = BigInt(tokenAmount);

    // Burn tokens (send to incinerator)
    const signature = await burnTokens(
      creatorKeypair,
      mintPubkey,
      amount
    );

    const explorerUrl = getExplorerUrl(signature);

    log.burn('Burn transaction confirmed', {
      signature,
      tokenAmount,
      explorerUrl,
    });

    // Record burn in database
    burnId = await insertBurn(buybackId, signature, tokenAmount);

    // Update status to confirmed
    await updateBurnStatus(burnId, 'confirmed');

    const result: BurnResult = {
      success: true,
      signature,
      tokensBurned: Number(tokenAmount),
      timestamp: Date.now(),
    };

    log.burn('Burn recorded in database', { burnId, buybackId });

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