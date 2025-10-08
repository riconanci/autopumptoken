/**
 * Pump.fun API Integration
 * 
 * CORRECTED: Reads claimable fees from Creator Vault PDA, not bonding curve!
 * 
 * Discovery: Creator fees are stored in a separate PDA per creator:
 * - Seeds: ["creator-vault", creator_pubkey]
 * - The account balance IS the claimable fees amount
 * - Owned by System Program (11111...)
 * - Has no data structure (balance-only account)
 */

import { PublicKey, Keypair, VersionedTransaction } from '@solana/web3.js';
import { slippageBps, creatorWalletSecret } from '../env';
import { log } from './logger';
import { connection } from './solana';
import { keypairFromSecret } from './solana';
import {
  PumpFunError,
  ClaimableFeesResponse,
} from '../types';

// Pump.fun Program ID (constant across all Pump.fun tokens)
const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// PumpPortal API endpoint
const PUMPPORTAL_API = 'https://pumpportal.fun/api/trade-local';

/**
 * Pump.fun API Client
 */
class PumpFunAPI {
  /**
   * Derive bonding curve PDA for a given token mint
   * The bonding curve stores all the token's liquidity and fee data
   */
  private async getBondingCurvePDA(mint: PublicKey): Promise<PublicKey> {
    const [bondingCurve] = await PublicKey.findProgramAddress(
      [Buffer.from('bonding-curve'), mint.toBuffer()],
      PUMP_PROGRAM_ID
    );
    return bondingCurve;
  }

  /**
   * Derive Creator Vault PDA
   * This is where claimable creator fees are stored (not in bonding curve!)
   * 
   * @param creatorPubkey - Creator wallet public key
   * @returns Creator Vault PDA address
   */
  private async getCreatorVaultPDA(creatorPubkey: PublicKey): Promise<PublicKey> {
    const [creatorVault] = await PublicKey.findProgramAddress(
      [Buffer.from('creator-vault'), creatorPubkey.toBuffer()],
      PUMP_PROGRAM_ID
    );
    return creatorVault;
  }

  /**
   * Get claimable creator fees for a token
   * 
   * ✅ CORRECTED APPROACH:
   * Reads from Creator Vault PDA, not bonding curve!
   * 
   * Creator Vault:
   * - PDA derived with seeds: ["creator-vault", creator_pubkey]
   * - Simple balance-only account (no data structure)
   * - Account balance = claimable fees in SOL
   * - Owned by System Program (11111...)
   * 
   * This is accurate and will scale correctly as fees accumulate!
   * 
   * @param mint - Token mint address (not used, but kept for API compatibility)
   * @returns ClaimableFeesResponse with accurate fees in SOL
   */
  async getClaimableFees(mint: string): Promise<ClaimableFeesResponse> {
    try {
      log.monitor('Checking claimable fees from Creator Vault', { mint });

      // Get creator wallet keypair
      const creatorKeypair = keypairFromSecret(creatorWalletSecret);
      const creatorPubkey = creatorKeypair.publicKey;

      // Derive Creator Vault PDA
      const creatorVault = await this.getCreatorVaultPDA(creatorPubkey);

      log.monitor('Creator Vault PDA derived', {
        creator: creatorPubkey.toBase58(),
        creatorVault: creatorVault.toBase58(),
      });

      // Read Creator Vault account
      const accountInfo = await connection.getAccountInfo(creatorVault);

      if (!accountInfo) {
        // Creator Vault doesn't exist yet (no fees accumulated)
        log.warn('Creator Vault account not found', { 
          creator: creatorPubkey.toBase58(),
          vault: creatorVault.toBase58(),
        });
        return {
          claimableFees: 0,
          timestamp: Date.now(),
          bondingCurveAddress: creatorVault.toString(),
        };
      }

      // The account balance IS the claimable fees!
      const claimableFees = accountInfo.lamports / 1e9;

      log.monitor('Claimable fees read from Creator Vault', {
        creator: creatorPubkey.toBase58(),
        creatorVault: creatorVault.toBase58(),
        claimableFees,
        accountBalance: accountInfo.lamports,
        note: 'Account balance = claimable fees',
      });

      return {
        claimableFees,
        timestamp: Date.now(),
        bondingCurveAddress: creatorVault.toString(),
      };
    } catch (error) {
      log.error('Failed to check claimable fees', error, { mint });
      throw new PumpFunError(
        `Failed to check claimable fees: ${error}`,
        { mint, error }
      );
    }
  }

  /**
   * Claim creator fees using PumpPortal trade-local API
   * 
   * This sends all accumulated creator fees to the creator wallet.
   * The PumpPortal API builds and returns an unsigned transaction that we sign and send.
   * 
   * CRITICAL: Always check wallet balance before and after to get actual claimed amount!
   * This is the ONLY reliable way to know how much was actually claimed.
   * 
   * @param mint - Token mint address (not used by API but kept for logging)
   * @param creatorKeypair - Creator wallet keypair that will receive the fees
   * @param amount - Optional specific amount (API ignores this, claims all fees)
   * @returns Transaction signature
   */
  async claimFees(
    mint: string,
    creatorKeypair: Keypair,
    amount?: number
  ): Promise<string> {
    try {
      log.claim('Initiating fee claim via PumpPortal', { 
        mint, 
        creator: creatorKeypair.publicKey.toBase58(),
        estimatedAmount: amount,
      });

      // Call PumpPortal trade-local API to build claim transaction
      const response = await fetch(PUMPPORTAL_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publicKey: creatorKeypair.publicKey.toBase58(),
          action: 'collectCreatorFee',
          priorityFee: 0.000001,
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        // ✅ BETTER ERROR HANDLING: Detect "no fees" responses
        if (errorText.toLowerCase().includes('no fees') || 
            errorText.toLowerCase().includes('nothing to claim') ||
            errorText.toLowerCase().includes('insufficient') ||
            errorText.toLowerCase().includes('zero') ||
            errorText.toLowerCase().includes('0 sol')) {
          log.warn('PumpPortal confirmed no claimable fees', { 
            mint,
            apiResponse: errorText,
            note: 'No actual fees available to claim at this time'
          });
          throw new PumpFunError(
            'No creator fees available to claim (confirmed by PumpPortal)',
            { mint, apiResponse: errorText }
          );
        }
        
        throw new PumpFunError(
          `PumpPortal API error: ${response.status} ${errorText}`
        );
      }

      // Get unsigned transaction as binary data
      const transactionBytes = await response.arrayBuffer();
      const transaction = VersionedTransaction.deserialize(
        new Uint8Array(transactionBytes)
      );
      
      log.claim('Received unsigned transaction from PumpPortal', {
        mint,
        transactionSize: transactionBytes.byteLength,
      });

      // Sign transaction with creator keypair
      transaction.sign([creatorKeypair]);

      // Send to Solana network
      const signature = await connection.sendTransaction(transaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      log.claim('Fee claim transaction sent', { signature, mint });

      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');

      log.claim('Fee claim confirmed', { signature, mint });

      return signature;
    } catch (error) {
      log.error('Fee claim failed', error, { mint });
      
      // Re-throw PumpFunErrors as-is
      if (error instanceof PumpFunError) {
        throw error;
      }
      
      throw new PumpFunError(
        `Failed to claim fees: ${error}`,
        { mint, error }
      );
    }
  }

  /**
   * Buy tokens using PumpPortal trade-local API
   * 
   * Purchases tokens from the Pump.fun bonding curve.
   * The API builds a swap transaction that we sign and send.
   * 
   * @param mint - Token mint address to buy
   * @param amountSol - Amount of SOL to spend (EXACT amount)
   * @param buyerKeypair - Wallet that will receive the tokens
   * @param slippage - Slippage tolerance in basis points (100 = 1%)
   * @param priorityFee - Priority fee in SOL (default 0.0001, can be lowered to 0.00001)
   * @returns Object with transaction signature and tokens purchased
   */
  async buyToken(
    mint: string,
    amountSol: number,
    buyerKeypair: Keypair,
    slippage: number = slippageBps,
    priorityFee: number = 0.0001
  ): Promise<{ signature: string; tokensPurchased: string }> {
    try {
      log.buyback('Initiating token purchase via PumpPortal', {
        mint,
        amountSol,
        slippage,
        priorityFee,
        buyer: buyerKeypair.publicKey.toBase58(),
      });

      // Call PumpPortal trade-local API to build buy transaction
      const response = await fetch(PUMPPORTAL_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publicKey: buyerKeypair.publicKey.toBase58(),
          action: 'buy',
          mint,
          denominatedInSol: 'true',
          amount: amountSol, // EXACT amount to spend
          slippage,
          priorityFee,
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new PumpFunError(
          `PumpPortal buy API error: ${response.status} ${errorText}`
        );
      }

      // Get unsigned transaction as binary data
      const transactionBytes = await response.arrayBuffer();
      const transaction = VersionedTransaction.deserialize(
        new Uint8Array(transactionBytes)
      );
      
      log.buyback('Received unsigned buy transaction from PumpPortal', {
        mint,
        transactionSize: transactionBytes.byteLength,
      });

      // Sign transaction with buyer keypair
      transaction.sign([buyerKeypair]);

      // Send to Solana network
      const signature = await connection.sendTransaction(transaction, {
        skipPreflight: false,
        maxRetries: 3,
      });

      log.buyback('Buy transaction sent', { signature, mint });

      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');

      log.buyback('Buy transaction confirmed', { signature, mint });

      // Extract tokens purchased from transaction logs
      const txDetails = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      const tokensPurchased = this.extractTokensPurchased(txDetails);

      log.buyback('Token purchase complete', {
        signature,
        tokensPurchased,
        mint,
        solSpent: amountSol,
      });

      return { signature, tokensPurchased };
    } catch (error) {
      log.error('Token purchase failed', error, { mint, amountSol });
      throw new PumpFunError(
        `Failed to buy tokens: ${error}`,
        { mint, amountSol, error }
      );
    }
  }

  /**
   * Extract number of tokens purchased from transaction details
   * 
   * Analyzes the transaction's token balance changes to determine
   * how many tokens were received in the swap.
   * 
   * @param txDetails - Transaction details from getTransaction
   * @returns String representation of tokens purchased (for precision)
   */
  private extractTokensPurchased(txDetails: any): string {
    try {
      if (!txDetails?.meta?.postTokenBalances) {
        log.warn('No token balances found in transaction');
        return '0';
      }

      const preBalances = txDetails.meta.preTokenBalances || [];
      const postBalances = txDetails.meta.postTokenBalances || [];

      // Find the account with token balance increase
      for (const postBalance of postBalances) {
        const preBalance = preBalances.find(
          (pre: any) => pre.accountIndex === postBalance.accountIndex
        );

        const preAmount = preBalance?.uiTokenAmount?.uiAmount || 0;
        const postAmount = postBalance.uiTokenAmount?.uiAmount || 0;
        const change = postAmount - preAmount;

        if (change > 0) {
          log.debug('Token balance change detected', {
            accountIndex: postBalance.accountIndex,
            preAmount,
            postAmount,
            change,
          });
          return change.toString();
        }
      }

      log.warn('No positive token balance change found');
      return '0';
    } catch (error) {
      log.error('Failed to extract tokens purchased', error);
      return '0';
    }
  }

  /**
   * Get current token price from bonding curve
   * 
   * Calculates the current price based on the virtual reserves in the bonding curve.
   * This is used for estimates and should not be relied upon for exact amounts.
   * 
   * Price = virtualSolReserves / virtualTokenReserves
   * 
   * @param mint - Token mint address
   * @returns Price in SOL per token
   */
  async getTokenPrice(mint: string): Promise<number> {
    try {
      const mintPubkey = new PublicKey(mint);
      const bondingCurve = await this.getBondingCurvePDA(mintPubkey);

      const accountInfo = await connection.getAccountInfo(bondingCurve);
      
      if (!accountInfo) {
        throw new PumpFunError('Bonding curve not found');
      }

      const data = accountInfo.data;
      
      // Read reserves from bonding curve
      // Offset 0: virtual_token_reserves (u64)
      // Offset 8: virtual_sol_reserves (u64)
      const virtualTokenReserves = Number(data.readBigUInt64LE(0));
      const virtualSolReserves = Number(data.readBigUInt64LE(8));
      
      if (virtualTokenReserves === 0) {
        throw new PumpFunError('Invalid bonding curve: zero token reserves');
      }

      // Calculate price: SOL per token
      const price = virtualSolReserves / virtualTokenReserves;
      
      log.debug('Token price calculated', { 
        mint, 
        price,
        virtualSolReserves,
        virtualTokenReserves 
      });
      
      return price;
    } catch (error) {
      log.error('Failed to get token price', error, { mint });
      throw new PumpFunError(
        `Failed to get token price: ${error}`,
        { mint, error }
      );
    }
  }

  /**
   * Get detailed bonding curve info for debugging
   * 
   * Returns all readable offsets for analysis and verification
   * 
   * @param mint - Token mint address
   * @returns Object with all bonding curve data
   */
  async getBondingCurveDebugInfo(mint: string): Promise<any> {
    try {
      const mintPubkey = new PublicKey(mint);
      const bondingCurve = await this.getBondingCurvePDA(mintPubkey);
      const accountInfo = await connection.getAccountInfo(bondingCurve);

      if (!accountInfo) {
        throw new PumpFunError('Bonding curve not found');
      }

      const data = accountInfo.data;

      return {
        bondingCurve: bondingCurve.toString(),
        accountBalance: accountInfo.lamports / 1e9,
        dataLength: data.length,
        offsets: {
          virtualTokenReserves: Number(data.readBigUInt64LE(0)) / 1e9,
          virtualSolReserves: Number(data.readBigUInt64LE(8)) / 1e9,
          realTokenReserves: Number(data.readBigUInt64LE(16)) / 1e9,
          realSolReserves: Number(data.readBigUInt64LE(24)) / 1e9,
          offset32: Number(data.readBigUInt64LE(32)) / 1e9,
          offset40: Number(data.readBigUInt64LE(40)) / 1e9,
          offset48: Number(data.readBigUInt64LE(48)) / 1e9,
          offset56: Number(data.readBigUInt64LE(56)) / 1e9,
          offset64: Number(data.readBigUInt64LE(64)) / 1e9,
          offset72: Number(data.readBigUInt64LE(72)) / 1e9,
          offset80: Number(data.readBigUInt64LE(80)) / 1e9,
          offset88: Number(data.readBigUInt64LE(88)) / 1e9,
          offset96: Number(data.readBigUInt64LE(96)) / 1e9,
        },
      };
    } catch (error) {
      log.error('Failed to get debug info', error, { mint });
      throw new PumpFunError(
        `Failed to get bonding curve debug info: ${error}`,
        { mint, error }
      );
    }
  }
}

// Export singleton instance
export const pumpFunAPI = new PumpFunAPI();

// Export class for testing
export { PumpFunAPI };