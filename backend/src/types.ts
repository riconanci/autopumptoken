import { PublicKey, Transaction } from '@solana/web3.js';

// ========================================
// FEE MONITORING & CLAIMING
// ========================================

export interface ClaimableFeesResponse {
  claimableFees: number; // in SOL
  timestamp: number;
  bondingCurveAddress: string;
}

export interface ClaimResult {
  success: boolean;
  signature?: string;
  claimedAmount: number; // in SOL
  treasuryAmount: number; // in SOL
  buybackAmount: number; // in SOL
  error?: string;
  timestamp: number;
}

export interface BuybackResult {
  success: boolean;
  signature?: string;
  buybackId?: number; // ✅ ADDED: Database ID for linking burn records
  tokensPurchased: number; // in token units
  solSpent: number;
  error?: string;
  timestamp: number;
}

export interface BurnResult {
  success: boolean;
  signature?: string;
  tokensBurned: number; // in token units
  error?: string;
  timestamp: number;
}

// ========================================
// PUMP.FUN API TYPES
// ========================================

export interface PumpFunBondingCurve {
  virtualSolReserves: number;
  virtualTokenReserves: number;
  realSolReserves: number;
  realTokenReserves: number;
  tokenTotalSupply: number;
  complete: boolean;
}

export interface PumpFunTokenData {
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  bondingCurve: string;
  creator: string;
}

export interface PumpPortalClaimRequest {
  action: 'claim';
  mint: string;
  amount?: number; // Optional: claim specific amount
}

export interface PumpPortalBuyRequest {
  action: 'buy';
  mint: string;
  amount: number; // in SOL
  denominatedInSol: 'true' | 'false';
  slippage: number; // in basis points
  priorityFee?: number; // in microlamports
}

export interface PumpPortalResponse {
  status: 'success' | 'error';
  signature?: string;
  message?: string;
  error?: string;
}

// ========================================
// DATABASE MODELS
// ========================================

export interface ClaimRecord {
  id: number;
  signature: string;
  claimedAmount: number; // in lamports
  treasuryAmount: number; // in lamports
  buybackAmount: number; // in lamports
  timestamp: Date;
  blockNumber?: number;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface BuybackRecord {
  id: number;
  claimId: number; // foreign key to ClaimRecord
  signature: string;
  tokensPurchased: string; // store as string to avoid precision loss
  solSpent: number; // in lamports
  timestamp: Date;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface BurnRecord {
  id: number;
  buybackId: number; // foreign key to BuybackRecord
  signature: string;
  tokensBurned: string; // store as string to avoid precision loss
  timestamp: Date;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface MonitorCheck {
  id: number;
  claimableFees: number; // in lamports
  threshold: number; // in lamports
  triggered: boolean;
  timestamp: Date;
}

// ========================================
// ANALYTICS & STATS
// ========================================

export interface SystemStats {
  totalClaimedFees: number; // in SOL
  totalTreasuryTransferred: number; // in SOL
  totalBuybackSpent: number; // in SOL
  totalTokensBurned: string; // as string for precision
  totalClaims: number;
  totalBuybacks: number;
  totalBurns: number;
  lastClaimTimestamp?: number;
  nextCheckTimestamp: number;
  currentClaimableFees: number; // in SOL
  systemStatus: 'active' | 'paused' | 'error';
}

export interface TransactionHistoryItem {
  type: 'claim' | 'buyback' | 'burn';
  signature: string;
  amount: number | string;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
  sol_spent?: number; // ✅ ADDED: For displaying SOL used in burn feed
  explorerUrl: string;
}

export interface DashboardData {
  stats: SystemStats;
  recentTransactions: TransactionHistoryItem[];
  burnChartData: Array<{
    timestamp: number;
    cumulativeBurned: number;
  }>;
  treasuryChartData: Array<{
    timestamp: number;
    cumulativeTransferred: number;
  }>;
}

// ========================================
// SCHEDULER & MONITORING
// ========================================

export interface SchedulerStatus {
  isRunning: boolean;
  lastCheckTime?: number;
  nextCheckTime?: number;
  checksPerformed: number;
  claimsTriggered: number;
  claimInProgress?: boolean; // ✅ ADDED: Prevents race conditions during claim operations
  errors: Array<{
    timestamp: number;
    message: string;
    stack?: string;
  }>;
}

export interface MonitorConfig {
  intervalMinutes: number;
  thresholdSol: number;
  autoClaimEnabled: boolean;
  maxRetries: number;
}

// ========================================
// API REQUEST/RESPONSE TYPES
// ========================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface ManualClaimRequest {
  adminApiKey: string;
  force?: boolean; // Force claim even if below threshold
}

export interface AdminControlRequest {
  adminApiKey: string;
  action: 'pause' | 'resume' | 'status';
}

export interface StatsRequest {
  period?: '24h' | '7d' | '30d' | 'all';
  includeChart?: boolean;
}

// ========================================
// TRANSACTION BUILDER TYPES
// ========================================

export interface TransactionConfig {
  feePayer: PublicKey;
  recentBlockhash: string;
  signatures?: Array<{
    publicKey: PublicKey;
    signature: Buffer | null;
  }>;
}

export interface SendTransactionOptions {
  maxRetries?: number;
  skipPreflight?: boolean;
  preflightCommitment?: 'processed' | 'confirmed' | 'finalized';
}

// ========================================
// UTILITY TYPES
// ========================================

export type SolAmount = number; // Always in SOL (not lamports)
export type LamportAmount = number; // Always in lamports
export type TokenAmount = string | number; // Token amounts with decimals

export interface WalletKeypair {
  publicKey: PublicKey;
  secretKey: Uint8Array;
}

// ========================================
// ERROR TYPES
// ========================================

export class AutoPumpError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AutoPumpError';
  }
}

export class TransactionError extends AutoPumpError {
  constructor(message: string, public signature?: string, details?: any) {
    super(message, 'TRANSACTION_ERROR', details);
    this.name = 'TransactionError';
  }
}

export class PumpFunError extends AutoPumpError {
  constructor(message: string, details?: any) {
    super(message, 'PUMPFUN_ERROR', details);
    this.name = 'PumpFunError';
  }
}

export class InsufficientFeesError extends AutoPumpError {
  constructor(current: number, threshold: number) {
    super(
      `Claimable fees (${current} SOL) below threshold (${threshold} SOL)`,
      'INSUFFICIENT_FEES',
      { current, threshold }
    );
    this.name = 'InsufficientFeesError';
  }
}