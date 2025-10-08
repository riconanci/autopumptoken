/**
 * Updated PumpFun API - Reads directly from Solana blockchain
 * Replace your current src/lib/pumpfun.ts with this
 */

import axios, { AxiosInstance } from 'axios';
import { PublicKey, Keypair, VersionedTransaction } from '@solana/web3.js';
import { connection } from './solana';
import { pumpApiBase, slippageBps } from '../env';
import { log } from './logger';
import {
  PumpFunTokenData,
  PumpFunError,
  ClaimableFeesResponse,
} from '../types';

// Pump.fun program ID (this is constant)
const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

class PumpFunAPI {
  private client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Derive bonding curve PDA from mint address
   */
  private async getBondingCurvePDA(mint: PublicKey): Promise<PublicKey> {
    const [bondingCurve] = await PublicKey.findProgramAddress(
      [Buffer.from('bonding-curve'), mint.toBuffer()],
      PUMP_PROGRAM_ID
    );
    return bondingCurve;
  }

  /**
   * Get claimable fees by reading bonding curve account directly
   */
  async getClaimableFees(mint: string): Promise<ClaimableFeesResponse> {
    try {
      log.monitor('Checking claimable fees from blockchain', { mint });

      const mintPubkey = new PublicKey(mint);
      const bondingCurve = await this.getBondingCurvePDA(mintPubkey);

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

      // For Pump.fun, claimable fees = total account balance - rent-exempt minimum
      const accountBalance = accountInfo.lamports / 1e9; // Convert to SOL
      const rentExemptMinimum = 0.002; // ~2000 lamports for rent
      const claimableFees = Math.max(0, accountBalance - rentExemptMinimum);

      log.monitor('Claimable fees calculated', {
        mint,
        claimableFees,
        accountBalance,
        bondingCurve: bondingCurve.toString(),
      });

      return {
        claimableFees,
        timestamp: Date.now(),
        bondingCurveAddress: bondingCurve.toString(),
      };
    } catch (error) {
      log.error('Failed to check claimable fees', error);
      
      return {
        claimableFees: 0,
        timestamp: Date.now(),
        bondingCurveAddress: '',
      };
    }
  }

  /**
   * Claim creator fees using PumpPortal
   */
  async claimFees(
    mint: string,
    creatorKeypair: Keypair,
    amount?: number
  ): Promise<string> {
    try {
      log.claim('Initiating fee claim', { mint });

      // Build claim transaction via PumpPortal Local API
      const response = await fetch('https://pumpportal.fun/api/trade-local', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publicKey: creatorKeypair.publicKey.toBase58(),
          action: 'collectCreatorFee',
          priorityFee: 0.000001, // 0.000001 SOL priority fee
          // Note: Collects ALL creator fees, no need to specify mint or amount
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        // If no fees to claim
        if (errorText.includes('no fees') || errorText.includes('nothing to claim')) {
          throw new PumpFunError('No creator fees available to claim');
        }
        
        throw new PumpFunError(`PumpPortal API error: ${response.status} ${errorText}`);
      }

      // Get unsigned transaction as binary
      const transactionBytes = await response.arrayBuffer();
      const transaction = VersionedTransaction.deserialize(new Uint8Array(transactionBytes));
      
      // Sign transaction
      transaction.sign([creatorKeypair]);

      // Send transaction
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
      throw new PumpFunError(
        `Failed to claim fees: ${error}`,
        { mint, error }
      );
    }
  }

  /**
   * Buy tokens using PumpPortal
   */
  async buyToken(
    mint: string,
    amountSol: number,
    buyerKeypair: Keypair,
    slippage: number = slippageBps,
    priorityFee: number = 0.0001
  ): Promise<{ signature: string; tokensPurchased: string }> {
    try {
      log.buyback('Initiating token purchase', {
        mint,
        amountSol,
        slippage,
        priorityFee,
      });

      // Build buy transaction via PumpPortal
      const response = await this.client.post('/trade', {
        publicKey: buyerKeypair.publicKey.toBase58(),
        action: 'buy',
        mint,
        amount: amountSol,
        denominatedInSol: 'true',
        slippage,
        priorityFee: Math.floor(priorityFee * 1e9),
      });

      if (!response.data || !response.data.transaction) {
        throw new PumpFunError('Invalid buy response from PumpPortal');
      }

      // Deserialize and sign transaction
      const txBuffer = Buffer.from(response.data.transaction, 'base64');
      const transaction = VersionedTransaction.deserialize(txBuffer);
      
      transaction.sign([buyerKeypair]);

      // Send transaction
      const signature = await connection.sendTransaction(transaction, {
        skipPreflight: false,
        maxRetries: 3,
      });

      log.buyback('Buy transaction sent', { signature, mint });

      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');

      // Get tokens purchased from transaction logs
      const txDetails = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      const tokensPurchased = this.extractTokensPurchased(txDetails);

      log.buyback('Token purchase confirmed', {
        signature,
        tokensPurchased,
        mint,
      });

      return { signature, tokensPurchased };
    } catch (error) {
      throw new PumpFunError(
        `Failed to buy tokens: ${error}`,
        { mint, amountSol, error }
      );
    }
  }

  /**
   * Extract tokens purchased from transaction details
   */
  private extractTokensPurchased(txDetails: any): string {
    try {
      if (!txDetails?.meta?.postTokenBalances) {
        return '0';
      }

      const preBalances = txDetails.meta.preTokenBalances || [];
      const postBalances = txDetails.meta.postTokenBalances || [];

      for (const postBalance of postBalances) {
        const preBalance = preBalances.find(
          (b: any) => b.accountIndex === postBalance.accountIndex
        );

        if (preBalance) {
          const change =
            BigInt(postBalance.uiTokenAmount.amount) -
            BigInt(preBalance.uiTokenAmount.amount);

          if (change > 0) {
            return change.toString();
          }
        } else if (BigInt(postBalance.uiTokenAmount.amount) > 0) {
          return postBalance.uiTokenAmount.amount;
        }
      }

      return '0';
    } catch (error) {
      log.error('Failed to extract tokens purchased', error);
      return '0';
    }
  }

  /**
   * Get token price from bonding curve
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
      const virtualSolReserves = Number(data.readBigUInt64LE(40));
      const virtualTokenReserves = Number(data.readBigUInt64LE(8));
      
      if (virtualTokenReserves === 0) {
        throw new PumpFunError('Invalid bonding curve: zero token reserves');
      }

      const price = virtualSolReserves / virtualTokenReserves;
      
      log.debug('Token price calculated', { mint, price });
      
      return price;
    } catch (error) {
      throw new PumpFunError(
        `Failed to get token price: ${error}`,
        { mint, error }
      );
    }
  }
}

// Export singleton instance
export const pumpFunAPI = new PumpFunAPI(pumpApiBase);

// Export class for testing
export { PumpFunAPI };