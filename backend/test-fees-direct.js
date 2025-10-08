/**
 * Test script to verify direct blockchain fee checking
 * This bypasses PumpPortal API entirely for fee checking
 * 
 * Run: node test-fees-direct.js
 */

require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

const MINT = process.env.TOKEN_MINT || '9AV236iTUAhkJz2vwjKW8rCTsgH7TDNU9CiY67M4pump';
const RPC = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function testDirectBlockchainAccess() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('DIRECT BLOCKCHAIN FEE CHECK TEST');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log('Configuration:');
  console.log('  Token Mint:', MINT);
  console.log('  RPC Endpoint:', RPC);
  console.log('  Threshold:', process.env.CLAIM_THRESHOLD_SOL || '0.05', 'SOL\n');

  const connection = new Connection(RPC, 'confirmed');

  try {
    console.log('[STEP 1] Deriving bonding curve PDA...');
    const mintPubkey = new PublicKey(MINT);
    const [bondingCurve] = await PublicKey.findProgramAddress(
      [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
      PUMP_PROGRAM_ID
    );
    console.log('  ✓ Bonding Curve PDA:', bondingCurve.toString(), '\n');

    console.log('[STEP 2] Fetching account data from Solana...');
    const accountInfo = await connection.getAccountInfo(bondingCurve);

    if (!accountInfo) {
      console.log('  ✗ ERROR: Bonding curve account not found!');
      console.log('     → This token may not be on Pump.fun');
      console.log('     → Or the bonding curve may be closed\n');
      process.exit(1);
    }

    console.log('  ✓ Account found!');
    console.log('  → Data size:', accountInfo.data.length, 'bytes');
    console.log('  → Owner:', accountInfo.owner.toString(), '\n');

    console.log('[STEP 3] Parsing bonding curve data...');
    const data = accountInfo.data;
    
    // Account balance in SOL
    const accountBalance = accountInfo.lamports / 1e9;
    
    // Read real_sol_reserves from offset 32 (u64)
    // NOTE: This is the correct offset for your token!
    const realSolReservesLamports = data.readBigUInt64LE(32);
    const realSolReserves = Number(realSolReservesLamports) / 1e9;
    
    // Calculate claimable fees
    const claimableFees = Math.max(0, accountBalance - realSolReserves);
    
    console.log('  ✓ Parsed successfully!\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('RESULTS');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log('Account Balance:   ', accountBalance.toFixed(9), 'SOL');
    console.log('Real Reserves:     ', realSolReserves.toFixed(9), 'SOL');
    console.log('─────────────────────────────────────────────');
    console.log('Claimable Fees:    ', claimableFees.toFixed(9), 'SOL\n');

    const threshold = parseFloat(process.env.CLAIM_THRESHOLD_SOL || '0.05');
    
    if (claimableFees >= threshold) {
      console.log('✅ READY TO CLAIM!');
      console.log(`   Fees (${claimableFees.toFixed(6)} SOL) >= Threshold (${threshold} SOL)\n`);
      console.log('   Your system should automatically claim these fees.');
    } else {
      console.log('⏳ NOT READY TO CLAIM');
      console.log(`   Fees (${claimableFees.toFixed(6)} SOL) < Threshold (${threshold} SOL)\n`);
      console.log(`   Need ${(threshold - claimableFees).toFixed(6)} more SOL in fees.`);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ TEST PASSED - Direct blockchain access working!');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✗ TEST FAILED');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.error('Error:', error.message);
    console.error('\nStack:', error.stack);
    process.exit(1);
  }
}

testDirectBlockchainAccess();