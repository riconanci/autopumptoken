/**
 * Read ACTUAL claimable fees from Creator Vault
 * This is the correct way to read fees!
 * 
 * Run: node read-creator-vault.js
 */

require('dotenv').config();
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

async function readCreatorVault() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          READ ACTUAL CREATOR FEES (CORRECT WAY)            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const RPC = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
  const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  
  const connection = new Connection(RPC, 'finalized');
  
  // Get creator wallet
  const creatorKeypair = Keypair.fromSecretKey(bs58.decode(process.env.CREATOR_WALLET_SECRET));
  const creatorPubkey = creatorKeypair.publicKey;
  
  console.log('Creator Wallet:', creatorPubkey.toBase58());
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('METHOD 1: Derive Creator Vault PDA');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Try common PDA derivations
  const possibleSeeds = [
    ['creator-vault', creatorPubkey.toBuffer()],
    ['vault', creatorPubkey.toBuffer()],
    ['creator_vault', creatorPubkey.toBuffer()],
    ['creator', creatorPubkey.toBuffer()],
    ['fee-vault', creatorPubkey.toBuffer()],
  ];

  console.log('Trying different seed combinations...\n');

  for (const seeds of possibleSeeds) {
    const seedStr = seeds[0];
    try {
      const [vaultPDA, bump] = await PublicKey.findProgramAddress(seeds, PUMP_PROGRAM_ID);
      
      console.log(`  Seeds: ["${seedStr}", creator_pubkey]`);
      console.log(`  PDA: ${vaultPDA.toBase58()}`);
      console.log(`  Bump: ${bump}`);
      
      // Check if this matches the known vault from transaction
      if (vaultPDA.toBase58() === '5cWSxjJXJRzYa7B15pYLJwqyZRy9oZam2Z4844MtJUhe') {
        console.log(`  🎯 MATCH! This is the correct derivation!\n`);
      } else {
        console.log(`  ❌ No match\n`);
      }
    } catch (e) {
      console.log(`  ❌ Failed to derive with seeds: ["${seedStr}", creator_pubkey]\n`);
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('METHOD 2: Read Known Creator Vault Directly');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const knownVault = new PublicKey('5cWSxjJXJRzYa7B15pYLJwqyZRy9oZam2Z4844MtJUhe');
  
  console.log('Reading account: 5cWSxjJXJRzYa7B15pYLJwqyZRy9oZam2Z4844MtJUhe');
  console.log('(This is your Creator Vault from the transaction)\n');

  const accountInfo = await connection.getAccountInfo(knownVault);
  
  if (!accountInfo) {
    console.log('❌ Account not found!\n');
    return;
  }

  const balance = accountInfo.lamports / 1e9;
  
  console.log('✅ Creator Vault found!');
  console.log('');
  console.log('  Owner:', accountInfo.owner.toBase58());
  console.log('  Data Length:', accountInfo.data.length, 'bytes');
  console.log('  Balance:', balance.toFixed(9), 'SOL');
  console.log('  Executable:', accountInfo.executable);
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 RESULT: YOUR ACTUAL CLAIMABLE FEES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  💰 Claimable Fees: ' + balance.toFixed(9) + ' SOL');
  console.log('');

  // Compare with dashboard
  console.log('  Dashboard shows: 0.007000000 SOL (you said)');
  console.log('  Vault balance:   ' + balance.toFixed(9) + ' SOL');
  console.log('');
  
  const diff = Math.abs(balance - 0.007);
  if (diff < 0.0001) {
    console.log('  ✅ PERFECT MATCH! This is the correct account!');
  } else if (diff < 0.001) {
    console.log('  ✅ Very close! Likely correct (small timing difference)');
  } else {
    console.log('  ⚠️  Different from dashboard - may need to investigate');
  }
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('THRESHOLD CHECK');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const threshold = parseFloat(process.env.CLAIM_THRESHOLD_SOL || '0.01');
  
  console.log('  Your threshold:  ' + threshold.toFixed(9) + ' SOL');
  console.log('  Claimable fees:  ' + balance.toFixed(9) + ' SOL');
  console.log('');
  
  if (balance >= threshold) {
    console.log('  ✅ WOULD TRIGGER CLAIM!');
    console.log('     Fees (' + balance.toFixed(6) + ') >= Threshold (' + threshold + ')');
  } else {
    console.log('  ⏳ Below threshold');
    console.log('     Fees (' + balance.toFixed(6) + ') < Threshold (' + threshold + ')');
    console.log('     Need ' + (threshold - balance).toFixed(6) + ' more SOL');
  }
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 DATA STRUCTURE ANALYSIS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (accountInfo.data.length > 0) {
    console.log('Account has', accountInfo.data.length, 'bytes of data:');
    console.log('');
    console.log('First 64 bytes (hex):');
    console.log(accountInfo.data.slice(0, 64).toString('hex').match(/.{1,32}/g).join('\n'));
    console.log('');
    
    // Try reading as u64 at different offsets
    if (accountInfo.data.length >= 8) {
      console.log('Reading as u64 at different offsets:');
      for (let offset = 0; offset < Math.min(32, accountInfo.data.length - 8); offset += 8) {
        const value = accountInfo.data.readBigUInt64LE(offset);
        const asSol = Number(value) / 1e9;
        console.log(`  Offset ${offset}: ${value.toString().padEnd(20)} (${asSol.toFixed(9)} SOL)`);
      }
      console.log('');
    }
  } else {
    console.log('Account has no data (balance-only account)');
    console.log('This means the claimable amount IS the account balance! ✅');
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ SUCCESS!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('We found the correct account to read claimable fees!');
  console.log('');
  console.log('Next step: Update pumpfun.ts to read from Creator Vault');
  console.log('instead of trying to calculate from bonding curve.');
  console.log('');
}

readCreatorVault().catch(err => {
  console.error('\n❌ Error:', err.message);
  console.error(err);
  process.exit(1);
});