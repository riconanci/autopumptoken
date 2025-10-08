/**
 * Pump.fun API Integration
 * 
 * This module handles all interactions with Pump.fun tokens:
 * - Reading claimable creator fees directly from blockchain
 * - Claiming fees via PumpPortal trade-local API
 * - Buying tokens via PumpPortal trade-local API
 * - Getting token price for estimates
 */

import { PublicKey, Keypair, VersionedTransaction } from '@solana/web3.js';
import { slippageBps } from '../env';
import { log } from './logger';
import { connection } from './solana';
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
   * Get claimable creator fees for a token
   * 
   * IMPORTANT: The bonding curve stores creator fees directly at offset 32
   * as a u64 value in lamports. This is NOT calculated as balance - reserves!
   * 
   * Bonding Curve Data Structure (150 bytes):
   * - Offset 0-7:   Virtual token reserves (u64)
   * - Offset 8-15:  Virtual SOL reserves (u64)
   * - Offset 16-23: Real token reserves (u64)
   * - Offset 24-31: Real SOL reserves (u64)
   * - Offset 32-39: Creator fees in lamports (u64) ← THIS IS WHAT WE READ
   * - Offset 40+:   Other data (bonding curve params, etc.)
   * 
   * @param mint - Token mint address
   * @returns ClaimableFeesResponse with fees in SOL
   */
  async getClaimableFees(mint: string): Promise<ClaimableFeesResponse> {
    try {
      log.monitor('Checking claimable fees from blockchain', { mint });

      const mintPubkey = new PublicKey(mint);
      const bondingCurve = await this.getBondingCurvePDA(mintPubkey);

      log.monitor('Bonding curve PDA derived', {
        mint,
        bondingCurve: bondingCurve.toString(),
      });

      // Get bonding curve account data
      const accountInfo = await connection.getAccountInfo(bondingCurve);

      if (!accountInfo) {
        log.warn('Bonding curve account not found', { mint });
        return {
          claimableFees: 0,
          timestamp: Date.now(),
          bondingCurveAddress: bondingCurve.toString(),
        };
      }

      const data = accountInfo.data;
      const accountBalance = accountInfo.lamports / 1e9;

      // Read creator fees directly from offset 32
      // This is a u64 value in lamports representing accumulated trading fees
      const claimableFeesLamports = data.readBigUInt64LE(32);
      const claimableFees = Number(claimableFeesLamports) / 1e9;

      log.monitor('Claimable fees calculated', {
        mint,
        claimableFees,
        claimableFeesLamports: claimableFeesLamports.toString(),
        accountBalance,
        bondingCurve: bondingCurve.toString(),
      });

      return {
        claimableFees,
        timestamp: Date.now(),
        bondingCurveAddress: bondingCurve.toString(),
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
        creator: creatorKeypair.publicKey.toBase58() 
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
          priorityFee: 0.000001, // 0.000001 SOL priority fee
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        // Handle specific error cases
        if (errorText.includes('no fees') || errorText.includes('nothing to claim')) {
          throw new PumpFunError('No creator fees available to claim');
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
   * @param amountSol - Amount of SOL to spend
   * @param buyerKeypair - Wallet that will receive the tokens
   * @param slippage - Slippage tolerance in basis points (100 = 1%)
   * @param priorityFee - Priority fee in SOL (default 0.0001)
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
          amount: amountSol,
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
      // Offset 8: virtual_token_reserves (u64)
      // Offset 40: virtual_sol_reserves (u64)
      const virtualTokenReserves = Number(data.readBigUInt64LE(8));
      const virtualSolReserves = Number(data.readBigUInt64LE(40));
      
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
}

// Export singleton instance
export const pumpFunAPI = new PumpFunAPI();

// Export class for testing
export { PumpFunAPI };