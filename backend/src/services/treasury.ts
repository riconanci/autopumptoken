import { PublicKey } from '@solana/web3.js';
import { keypairFromSecret, transferSol, getExplorerUrl } from '../lib/solana';
import { log } from '../lib/logger';
import { creatorWalletSecret, treasuryWalletSecret } from '../env';

/**
 * Transfer SOL to treasury wallet
 */
export async function transferToTreasury(amountSol: number): Promise<string> {
  try {
    const creatorKeypair = keypairFromSecret(creatorWalletSecret);
    const treasuryKeypair = keypairFromSecret(treasuryWalletSecret);
    const treasuryPubkey = treasuryKeypair.publicKey;

    log.treasury('Initiating treasury transfer', {
      from: creatorKeypair.publicKey.toBase58(),
      to: treasuryPubkey.toBase58(),
      amount: amountSol,
    });

    const signature = await transferSol(
      creatorKeypair,
      treasuryPubkey,
      amountSol
    );

    const explorerUrl = getExplorerUrl(signature);

    log.treasury('Treasury transfer complete', {
      signature,
      amount: amountSol,
      explorerUrl,
    });

    return signature;
  } catch (error) {
    log.error('Treasury transfer failed', error, { amount: amountSol });
    throw error;
  }
}

/**
 * Get treasury wallet public key
 */
export function getTreasuryPublicKey(): PublicKey {
  const treasuryKeypair = keypairFromSecret(treasuryWalletSecret);
  return treasuryKeypair.publicKey;
}