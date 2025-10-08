import dotenv from 'dotenv';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

dotenv.config();

interface EnvConfig {
  // Network
  rpcEndpoint: string;
  pumpApiBase: string;

  // Wallets
  creatorWalletSecret: string;
  treasuryWalletSecret: string;

  // Token Config
  tokenMint: string;
  tokenSymbol: string;
  tokenName: string;

  // Claim Settings
  checkIntervalMinutes: number;
  claimThresholdSol: number;
  autoClaimEnabled: boolean;

  // Split Configuration
  treasuryPercent: number;
  buybackPercent: number;

  // Incinerator
  burnAddress: string;

  // Advanced
  slippageBps: number;
  maxRetries: number;
  confirmationCommitment: 'processed' | 'confirmed' | 'finalized';

  // Admin
  adminApiKey: string;
  enableManualClaim: boolean;

  // Monitoring
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  webhookUrl?: string;
  publicStatsEnabled: boolean;

  // Database
  databaseUrl: string;

  // Server
  port: number;
}

function validateEnv(): EnvConfig {
  const required = (key: string): string => {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  };

  const optional = (key: string, defaultValue: string): string => {
    return process.env[key] || defaultValue;
  };

  // Validate wallet secrets are valid base58
  const validateWalletSecret = (key: string): string => {
    const secret = required(key).trim(); // Trim whitespace
    try {
      const decoded = bs58.decode(secret);
      if (decoded.length !== 64) {
        throw new Error(
          `Invalid wallet secret length for ${key}. ` +
          `Expected 64 bytes, got ${decoded.length} bytes. ` +
          `Base58 string length: ${secret.length} (should be 87-88 chars). ` +
          `Make sure you're using the PRIVATE KEY (not public key) in base58 format.`
        );
      }
      return secret;
    } catch (error) {
      throw new Error(`Invalid base58 wallet secret for ${key}: ${error}`);
    }
  };

  // Validate public key
  const validatePublicKey = (key: string): string => {
    const value = required(key);
    try {
      new PublicKey(value);
      return value;
    } catch (error) {
      throw new Error(`Invalid public key for ${key}: ${error}`);
    }
  };

  // Validate percentages add up to 100
  const treasuryPercent = parseInt(optional('TREASURY_PERCENT', '50'));
  const buybackPercent = parseInt(optional('BUYBACK_PERCENT', '50'));
  
  if (treasuryPercent + buybackPercent !== 100) {
    throw new Error(
      `TREASURY_PERCENT (${treasuryPercent}) + BUYBACK_PERCENT (${buybackPercent}) must equal 100`
    );
  }

  if (treasuryPercent < 0 || treasuryPercent > 100) {
    throw new Error('TREASURY_PERCENT must be between 0 and 100');
  }

  // Validate burn address
  const burnAddress = optional(
    'BURN_ADDRESS',
    '1nc1nerator11111111111111111111111111111111'
  );
  try {
    new PublicKey(burnAddress);
  } catch (error) {
    throw new Error(`Invalid BURN_ADDRESS: ${error}`);
  }

  const config: EnvConfig = {
    // Network
    rpcEndpoint: optional('RPC_ENDPOINT', 'https://api.mainnet-beta.solana.com'),
    pumpApiBase: optional('PUMP_API_BASE', 'https://pumpportal.fun/api'),

    // Wallets
    creatorWalletSecret: validateWalletSecret('CREATOR_WALLET_SECRET'),
    treasuryWalletSecret: validateWalletSecret('TREASURY_WALLET_SECRET'),

    // Token Config
    tokenMint: validatePublicKey('TOKEN_MINT'),
    tokenSymbol: optional('TOKEN_SYMBOL', 'AUTOPUMP'),
    tokenName: optional('TOKEN_NAME', 'Auto Pump Token'),

    // Claim Settings
    checkIntervalMinutes: parseInt(optional('CHECK_INTERVAL_MINUTES', '5')),
    claimThresholdSol: parseFloat(optional('CLAIM_THRESHOLD_SOL', '0.05')),
    autoClaimEnabled: optional('AUTO_CLAIM_ENABLED', 'true') === 'true',

    // Split Configuration
    treasuryPercent,
    buybackPercent,

    // Incinerator
    burnAddress,

    // Advanced
    slippageBps: parseInt(optional('SLIPPAGE_BPS', '100')),
    maxRetries: parseInt(optional('MAX_RETRIES', '3')),
    confirmationCommitment: optional('CONFIRMATION_COMMITMENT', 'confirmed') as any,

    // Admin
    adminApiKey: required('ADMIN_API_KEY'),
    enableManualClaim: optional('ENABLE_MANUAL_CLAIM', 'true') === 'true',

    // Monitoring
    logLevel: optional('LOG_LEVEL', 'info') as any,
    webhookUrl: process.env.WEBHOOK_URL,
    publicStatsEnabled: optional('PUBLIC_STATS_ENABLED', 'true') === 'true',

    // Database
    databaseUrl: optional('DATABASE_URL', 'postgresql://localhost/autopump'),

    // Server
    port: parseInt(optional('PORT', '3000')),
  };

  // Validate numeric ranges
  if (config.checkIntervalMinutes < 1) {
    throw new Error('CHECK_INTERVAL_MINUTES must be at least 1');
  }

  if (config.claimThresholdSol <= 0) {
    throw new Error('CLAIM_THRESHOLD_SOL must be greater than 0');
  }

  if (config.slippageBps < 0 || config.slippageBps > 10000) {
    throw new Error('SLIPPAGE_BPS must be between 0 and 10000 (0-100%)');
  }

  return config;
}

export const env = validateEnv();

// Export individual values for convenience
export const {
  rpcEndpoint,
  pumpApiBase,
  creatorWalletSecret,
  treasuryWalletSecret,
  tokenMint,
  tokenSymbol,
  tokenName,
  checkIntervalMinutes,
  claimThresholdSol,
  autoClaimEnabled,
  treasuryPercent,
  buybackPercent,
  burnAddress,
  slippageBps,
  maxRetries,
  confirmationCommitment,
  adminApiKey,
  enableManualClaim,
  logLevel,
  webhookUrl,
  publicStatsEnabled,
  databaseUrl,
  port,
} = env;