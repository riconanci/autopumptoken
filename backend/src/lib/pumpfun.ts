import axios, { AxiosInstance } from 'axios';
import { PublicKey, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { pumpApiBase, slippageBps } from '../env';
import { log } from './logger';
import { connection } from './solana';
import {
  PumpFunTokenData,
  PumpPortalResponse,
  PumpFunError,
  ClaimableFeesResponse,
} from '../types';

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

  // Get token data from Pump.fun
  async getTokenData(mint: string): Promise<PumpFunTokenData> {
    try {
      log.debug('Fetching token data from Pump.fun', { mint });
      
      const response = await this.client.get(`/coins/${mint}`);
      return response.data;
    } catch (error) {
      throw new PumpFunError(
        `Failed to fetch token data: ${error}`,
        { mint, error }
      );
    }
  }

  // Get bonding curve data
  async getBondingCurveData(mint: string) {
    try {
      const tokenData = await this.getTokenData(mint);
      const bondingCurveAddress = tokenData.bondingCurve;

      log.debug('Fetching bonding curve data', { bondingCurveAddress });

      const accountInfo = await connection.getAccountInfo(
        new PublicKey(bondingCurveAddress)
      );

      if (!accountInfo) {
        throw new PumpFunError('Bonding curve account not found');
      }

      return {
        address: bondingCurveAddress,
        data: accountInfo.data,
        creator: tokenData.creator,
      };
    } catch (error) {
      throw new PumpFunError(
        `Failed to fetch bonding curve: ${error}`,
        { mint, error }
      );
    }
  }

  // Check claimable creator fees
  async getClaimableFees(mint: string): Promise<ClaimableFeesResponse> {
    try {
      log.monitor('Checking claimable fees', { mint });

      const response = await this.client.get(`/fees/${mint}`);

      const claimableFees = response.data.claimable || 0;
      const bondingCurveAddress = response.data.bondingCurve || '';

      log.monitor('Claimable fees retrieved', {
        mint,
        claimableFees,
        bondingCurveAddress,
      });

      return {
        claimableFees,
        timestamp: Date.now(),
        bondingCurveAddress,
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        log.warn('Fees endpoint not found, using fallback method');
        return this.getClaimableFeesFromBondingCurve(mint);
      }

      throw new PumpFunError(
        `Failed to check claimable fees: ${error}`,
        { mint, error }
      );
    }
  }

  // Fallback: Calculate claimable fees from bonding curve
  private async getClaimableFeesFromBondingCurve(
    mint: string
  ): Promise<ClaimableFeesResponse> {
    try {
      const bondingCurve = await this.getBondingCurveData(mint);
      
      const data = bondingCurve.data;
      
      const claimableFeesLamports = data.readBigUInt64LE(32);
      const claimableFees = Number(claimableFeesLamports) / 1e9;

      return {
        claimableFees,
        timestamp: Date.now(),
        bondingCurveAddress: bondingCurve.address,
      };
    } catch (error) {
      throw new PumpFunError(
        `Failed to calculate claimable fees: ${error}`,
        { mint, error }
      );
    }
  }

  // Claim creator fees using PumpPortal trade-local API
  async claimFees(
    mint: string,
    creatorKeypair: Keypair,
    amount?: number
  ): Promise<string> {
    try {
      log.claim('Initiating fee claim', { mint });

      // Use trade-local endpoint for claiming fees
      const response = await fetch('https://pumpportal.fun/api/trade-local', {
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
        
        if (errorText.includes('no fees') || errorText.includes('nothing to claim')) {
          throw new PumpFunError('No creator fees available to claim');
        }
        
        throw new PumpFunError(`PumpPortal API error: ${response.status} ${errorText}`);
      }

      const transactionBytes = await response.arrayBuffer();
      const transaction = VersionedTransaction.deserialize(new Uint8Array(transactionBytes));
      
      transaction.sign([creatorKeypair]);

      const signature = await connection.sendTransaction(transaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      log.claim('Fee claim transaction sent', { signature, mint });

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
   * Buy tokens using PumpPortal trade-local API
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

      // Use trade-local endpoint for buying tokens
      const response = await fetch('https://pumpportal.fun/api/trade-local', {
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

      // Get unsigned transaction as binary
      const transactionBytes = await response.arrayBuffer();
      const transaction = VersionedTransaction.deserialize(new Uint8Array(transactionBytes));
      
      // Sign transaction
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

  // Extract tokens purchased from transaction details
  private extractTokensPurchased(txDetails: any): string {
    try {
      if (!txDetails?.meta?.postTokenBalances) {
        return '0';
      }

      const preBalances = txDetails.meta.preTokenBalances || [];
      const postBalances = txDetails.meta.postTokenBalances || [];

      for (const postBalance of postBalances) {
        const preBalance = preBalances.find(
          (pre: any) => pre.accountIndex === postBalance.accountIndex
        );

        const preAmount = preBalance?.uiTokenAmount?.uiAmount || 0;
        const postAmount = postBalance.uiTokenAmount?.uiAmount || 0;
        const change = postAmount - preAmount;

        if (change > 0) {
          return change.toString();
        }
      }

      return '0';
    } catch (error) {
      log.warn('Failed to extract tokens purchased, returning 0', { error });
      return '0';
    }
  }

  // Get current token price from bonding curve
  async getTokenPrice(mint: string): Promise<number> {
    try {
      const tokenData = await this.getTokenData(mint);
      
      if (!tokenData.bondingCurve) {
        throw new PumpFunError('Token has no bonding curve');
      }

      const bondingCurveAccount = await connection.getAccountInfo(
        new PublicKey(tokenData.bondingCurve)
      );

      if (!bondingCurveAccount) {
        throw new PumpFunError('Bonding curve account not found');
      }

      const data = bondingCurveAccount.data;
      const virtualSolReserves = data.readBigUInt64LE(8);
      const virtualTokenReserves = data.readBigUInt64LE(16);

      const price = Number(virtualSolReserves) / Number(virtualTokenReserves);

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

export const pumpFunAPI = new PumpFunAPI(pumpApiBase);
export default pumpFunAPI;