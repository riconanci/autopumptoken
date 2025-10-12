/**
 * Wallet Validation Script
 * Tests if wallet private keys in .env are valid and accessible
 * 
 * Run: node validate-wallets.js
 */

const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bs58 = require('bs58');
require('dotenv').config();

// ANSI colors for better output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

async function validateWallet(name, secretKey, connection) {
  logSection(`Validating ${name}`);
  
  const results = {
    name,
    valid: false,
    keypair: null,
    publicKey: null,
    balance: null,
    errors: []
  };

  try {
    // Step 1: Check if secret key exists
    if (!secretKey) {
      results.errors.push('Secret key not found in .env');
      log('❌ Secret key not found in environment variables', 'red');
      return results;
    }
    log('✅ Secret key found in .env', 'green');

    // Step 2: Validate format (should be base58 string, ~87-88 characters)
    const secretKeyStr = secretKey.trim();
    if (secretKeyStr.length < 80 || secretKeyStr.length > 90) {
      results.errors.push(`Invalid length: ${secretKeyStr.length} chars (expected ~87-88)`);
      log(`❌ Invalid key length: ${secretKeyStr.length} characters`, 'red');
      return results;
    }
    log(`✅ Key length valid: ${secretKeyStr.length} characters`, 'green');

    // Step 3: Try to decode from base58
    let secretBytes;
    try {
      secretBytes = bs58.decode(secretKeyStr);
      log('✅ Successfully decoded from base58', 'green');
    } catch (error) {
      results.errors.push('Failed to decode base58: ' + error.message);
      log('❌ Failed to decode base58: Invalid characters', 'red');
      return results;
    }

    // Step 4: Validate byte array length (should be 64 bytes)
    if (secretBytes.length !== 64) {
      results.errors.push(`Invalid byte length: ${secretBytes.length} (expected 64)`);
      log(`❌ Invalid byte array length: ${secretBytes.length} bytes`, 'red');
      return results;
    }
    log('✅ Byte array length valid: 64 bytes', 'green');

    // Step 5: Create Keypair
    try {
      results.keypair = Keypair.fromSecretKey(secretBytes);
      results.publicKey = results.keypair.publicKey.toBase58();
      log('✅ Successfully created Keypair', 'green');
      log(`   Public Key: ${results.publicKey}`, 'blue');
    } catch (error) {
      results.errors.push('Failed to create Keypair: ' + error.message);
      log('❌ Failed to create Keypair: ' + error.message, 'red');
      return results;
    }

    // Step 6: Check if wallet exists on blockchain
    try {
      const accountInfo = await connection.getAccountInfo(results.keypair.publicKey);
      if (accountInfo) {
        log('✅ Wallet exists on blockchain', 'green');
      } else {
        log('⚠️  Wallet not found on blockchain (new wallet?)', 'yellow');
      }
    } catch (error) {
      results.errors.push('Failed to query blockchain: ' + error.message);
      log('⚠️  Could not query blockchain: ' + error.message, 'yellow');
    }

    // Step 7: Check balance
    try {
      const balance = await connection.getBalance(results.keypair.publicKey);
      results.balance = balance / LAMPORTS_PER_SOL;
      
      if (results.balance > 0) {
        log(`✅ Balance: ${results.balance.toFixed(6)} SOL`, 'green');
      } else {
        log('⚠️  Balance: 0 SOL (wallet needs funding)', 'yellow');
      }

      // Warn if balance is too low for operations
      if (results.balance < 0.01) {
        log('⚠️  Warning: Balance below 0.01 SOL (may not be enough for transactions)', 'yellow');
      }
    } catch (error) {
      results.errors.push('Failed to get balance: ' + error.message);
      log('⚠️  Could not get balance: ' + error.message, 'yellow');
    }

    // Step 8: Mark as valid if we got this far
    results.valid = true;
    log('✅ Wallet validation PASSED', 'green');

  } catch (error) {
    results.errors.push('Unexpected error: ' + error.message);
    log('❌ Unexpected error: ' + error.message, 'red');
  }

  return results;
}

async function validateTokenMint(mintAddress, connection) {
  logSection('Validating Token Mint');
  
  if (!mintAddress) {
    log('❌ TOKEN_MINT not found in .env', 'red');
    return false;
  }

  try {
    const mintPubkey = new PublicKey(mintAddress);
    log(`✅ Valid public key format: ${mintAddress}`, 'green');

    // Try to get mint info
    const { getMint } = require('@solana/spl-token');
    const mintInfo = await getMint(connection, mintPubkey);
    
    log('✅ Mint exists on blockchain', 'green');
    log(`   Decimals: ${mintInfo.decimals}`, 'blue');
    log(`   Supply: ${Number(mintInfo.supply) / Math.pow(10, mintInfo.decimals)}`, 'blue');
    
    return true;
  } catch (error) {
    log('❌ Failed to validate mint: ' + error.message, 'red');
    return false;
  }
}

async function main() {
  console.clear();
  logSection('🔐 WALLET VALIDATION TOOL');
  log('Checking wallet private keys from .env file...', 'cyan');

  // Initialize connection
  const rpcEndpoint = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
  log(`\nRPC Endpoint: ${rpcEndpoint}`, 'blue');
  
  const connection = new Connection(rpcEndpoint, 'confirmed');

  // Test connection
  try {
    const version = await connection.getVersion();
    log(`✅ Successfully connected to Solana RPC`, 'green');
    log(`   Version: ${version['solana-core']}`, 'blue');
  } catch (error) {
    log('❌ Failed to connect to RPC: ' + error.message, 'red');
    log('Check your RPC_ENDPOINT in .env', 'yellow');
    return;
  }

  // Validate wallets
  const wallets = [
    {
      name: 'Creator Wallet',
      envVar: 'CREATOR_WALLET_SECRET',
      secretKey: process.env.CREATOR_WALLET_SECRET
    },
    {
      name: 'Treasury Wallet',
      envVar: 'TREASURY_WALLET_SECRET',
      secretKey: process.env.TREASURY_WALLET_SECRET
    }
  ];

  const results = [];
  for (const wallet of wallets) {
    const result = await validateWallet(wallet.name, wallet.secretKey, connection);
    results.push(result);
  }

  // Validate token mint
  const mintValid = await validateTokenMint(process.env.TOKEN_MINT, connection);

  // Summary
  logSection('📊 VALIDATION SUMMARY');
  
  let allValid = true;
  results.forEach(result => {
    if (result.valid) {
      log(`✅ ${result.name}: VALID`, 'green');
      log(`   Address: ${result.publicKey}`, 'blue');
      log(`   Balance: ${result.balance?.toFixed(6) || 'N/A'} SOL`, 'blue');
    } else {
      log(`❌ ${result.name}: INVALID`, 'red');
      result.errors.forEach(err => log(`   - ${err}`, 'red'));
      allValid = false;
    }
    console.log('');
  });

  if (mintValid) {
    log('✅ Token Mint: VALID', 'green');
  } else {
    log('❌ Token Mint: INVALID', 'red');
    allValid = false;
  }

  console.log('\n' + '='.repeat(60));
  if (allValid) {
    log('🎉 ALL VALIDATIONS PASSED!', 'green');
    log('Your wallets are properly configured and ready to use.', 'green');
    
    // Check if any wallet needs funding
    const needsFunding = results.some(r => r.balance !== null && r.balance < 0.01);
    if (needsFunding) {
      console.log('');
      log('⚠️  IMPORTANT: Some wallets have low balance', 'yellow');
      log('Make sure to fund them before running the system:', 'yellow');
      results.forEach(r => {
        if (r.balance !== null && r.balance < 0.01) {
          log(`   ${r.name}: ${r.publicKey}`, 'yellow');
        }
      });
    }
  } else {
    log('❌ VALIDATION FAILED', 'red');
    log('Please fix the errors above before running the system.', 'red');
  }
  console.log('='.repeat(60) + '\n');

  // Export for programmatic use
  return {
    success: allValid,
    wallets: results,
    mintValid
  };
}

// Run if called directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { validateWallet, validateTokenMint };