/**
 * Environment Variable Diagnostic Tool
 * Save this as: backend/env-checker.ts
 * Run: cd backend && npx tsx env-checker.ts
 * 
 * This will check your .env file and show exactly what's missing or invalid
 */

import dotenv from 'dotenv';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import path from 'path';

// Load .env file from backend directory
dotenv.config({ path: path.join(__dirname, '.env') });

console.log('🔍 AUTO PUMP TOKEN - ENVIRONMENT CHECKER\n');
console.log('=' .repeat(60));

interface CheckResult {
  variable: string;
  status: 'MISSING' | 'INVALID' | 'OK';
  value?: string;
  error?: string;
}

const results: CheckResult[] = [];

// Helper functions
function checkRequired(key: string, validator?: (value: string) => void): void {
  const value = process.env[key];
  
  if (!value) {
    results.push({
      variable: key,
      status: 'MISSING',
      error: 'Required variable not set'
    });
    return;
  }

  if (validator) {
    try {
      validator(value);
      results.push({
        variable: key,
        status: 'OK',
        value: maskSensitive(key, value)
      });
    } catch (error) {
      results.push({
        variable: key,
        status: 'INVALID',
        value: maskSensitive(key, value),
        error: error instanceof Error ? error.message : 'Validation failed'
      });
    }
  } else {
    results.push({
      variable: key,
      status: 'OK',
      value: maskSensitive(key, value)
    });
  }
}

function checkOptional(key: string, defaultValue: string, validator?: (value: string) => void): void {
  const value = process.env[key] || defaultValue;
  
  if (validator) {
    try {
      validator(value);
      results.push({
        variable: key,
        status: 'OK',
        value: maskSensitive(key, value)
      });
    } catch (error) {
      results.push({
        variable: key,
        status: 'INVALID',
        value: maskSensitive(key, value),
        error: error instanceof Error ? error.message : 'Validation failed'
      });
    }
  } else {
    results.push({
      variable: key,
      status: 'OK',
      value: maskSensitive(key, value)
    });
  }
}

function maskSensitive(key: string, value: string): string {
  const sensitiveKeys = ['SECRET', 'KEY', 'PASSWORD'];
  if (sensitiveKeys.some(k => key.includes(k))) {
    return `${value.substring(0, 8)}...(${value.length} chars)`;
  }
  return value;
}

// Validators
function validateWalletSecret(value: string): void {
  const trimmed = value.trim();
  const decoded = bs58.decode(trimmed);
  
  if (decoded.length !== 64) {
    throw new Error(
      `Invalid length: ${decoded.length} bytes (expected 64). ` +
      `Base58 length: ${trimmed.length} chars (should be 87-88)`
    );
  }
}

function validatePublicKey(value: string): void {
  new PublicKey(value);
}

function validateUrl(value: string): void {
  try {
    new URL(value);
  } catch {
    throw new Error('Invalid URL format');
  }
}

function validateNumber(value: string): void {
  if (isNaN(Number(value))) {
    throw new Error('Must be a valid number');
  }
}

function validateBoolean(value: string): void {
  if (value !== 'true' && value !== 'false') {
    throw new Error('Must be "true" or "false"');
  }
}

// Run checks
console.log('NETWORK CONFIGURATION\n');
checkOptional('RPC_ENDPOINT', 'https://api.mainnet-beta.solana.com', validateUrl);
checkOptional('PUMP_API_BASE', 'https://pumpportal.fun/api', validateUrl);

console.log('\nWALLET CONFIGURATION\n');
checkRequired('CREATOR_WALLET_SECRET', validateWalletSecret);
checkRequired('TREASURY_WALLET_SECRET', validateWalletSecret);

console.log('\nTOKEN CONFIGURATION\n');
checkRequired('TOKEN_MINT', validatePublicKey);
checkOptional('TOKEN_SYMBOL', 'AUTOPUMP');
checkOptional('TOKEN_NAME', 'Auto Pump Token');

console.log('\nCLAIM SETTINGS\n');
checkOptional('CHECK_INTERVAL_MINUTES', '5', validateNumber);
checkOptional('CLAIM_THRESHOLD_SOL', '0.05', validateNumber);
checkOptional('AUTO_CLAIM_ENABLED', 'true', validateBoolean);

console.log('\nSPLIT CONFIGURATION\n');
checkOptional('TREASURY_PERCENT', '50', validateNumber);
checkOptional('BUYBACK_PERCENT', '50', validateNumber);

// Validate percentages add up
const treasuryPercent = parseInt(process.env.TREASURY_PERCENT || '50');
const buybackPercent = parseInt(process.env.BUYBACK_PERCENT || '50');
if (treasuryPercent + buybackPercent !== 100) {
  results.push({
    variable: 'TREASURY_PERCENT + BUYBACK_PERCENT',
    status: 'INVALID',
    error: `Sum must equal 100 (currently ${treasuryPercent + buybackPercent})`
  });
}

console.log('\nBURN CONFIGURATION\n');
checkOptional('BURN_ADDRESS', '1nc1nerator11111111111111111111111111111111', validatePublicKey);

console.log('\nADVANCED SETTINGS\n');
checkOptional('SLIPPAGE_BPS', '100', validateNumber);
checkOptional('MAX_RETRIES', '3', validateNumber);
checkOptional('CONFIRMATION_COMMITMENT', 'confirmed');

console.log('\nADMIN CONFIGURATION\n');
checkRequired('ADMIN_API_KEY');
checkOptional('ENABLE_MANUAL_CLAIM', 'true', validateBoolean);

console.log('\nMONITORING\n');
checkOptional('LOG_LEVEL', 'info');
if (process.env.WEBHOOK_URL) {
  checkOptional('WEBHOOK_URL', '', validateUrl);
}
checkOptional('PUBLIC_STATS_ENABLED', 'true', validateBoolean);

console.log('\nDATABASE\n');
checkOptional('DATABASE_URL', 'postgresql://localhost/autopump');

console.log('\nSERVER\n');
checkOptional('PORT', '3000', validateNumber);

// Display results
console.log('\n' + '='.repeat(60));
console.log('RESULTS\n');

const missing = results.filter(r => r.status === 'MISSING');
const invalid = results.filter(r => r.status === 'INVALID');
const ok = results.filter(r => r.status === 'OK');

// Show errors first
if (missing.length > 0) {
  console.log('❌ MISSING VARIABLES:\n');
  missing.forEach(r => {
    console.log(`   ${r.variable}`);
    console.log(`      Error: ${r.error}\n`);
  });
}

if (invalid.length > 0) {
  console.log('⚠️  INVALID VALUES:\n');
  invalid.forEach(r => {
    console.log(`   ${r.variable}: ${r.value}`);
    console.log(`      Error: ${r.error}\n`);
  });
}

// Summary
console.log('SUMMARY:');
console.log(`   ✅ Valid: ${ok.length}`);
console.log(`   ❌ Missing: ${missing.length}`);
console.log(`   ⚠️  Invalid: ${invalid.length}`);

console.log('\n' + '='.repeat(60));

if (missing.length === 0 && invalid.length === 0) {
  console.log('✅ ALL CHECKS PASSED! You can start the server.\n');
  process.exit(0);
} else {
  console.log('❌ CONFIGURATION ERRORS FOUND!\n');
  console.log('Fix the issues above and run this script again.\n');
  console.log('📝 Create a .env file based on .env.example and fill in all required values.\n');
  process.exit(1);
}