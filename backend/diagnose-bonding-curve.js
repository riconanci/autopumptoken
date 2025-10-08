/**
 * Diagnostic script to check what values are in your bonding curve
 * This will show us why it was claiming when fees were 0
 * 
 * Run: node diagnose-bonding-curve.js
 */

require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

async function diagnose() {
  const MINT = process.env.TOKEN_MINT;
  const RPC = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
  const PUMP_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  
  console.log('\n================================================');
  console.log('BONDING CURVE DIAGNOSTIC');
  console.log('================================================\n');
  
  const connection = new Connection(RPC);
  const mintPubkey = new PublicKey(MINT);
  
  console.log('Token Mint:', MINT);
  console.log('RPC:', RPC, '\n');
  
  // Derive bonding curve PDA
  const [bondingCurve] = await PublicKey.findProgramAddress(
    [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
    PUMP_PROGRAM
  );
  
  console.log('Bonding Curve PDA:', bondingCurve.toString(), '\n');
  
  // Get account info
  const accountInfo = await connection.getAccountInfo(bondingCurve);
  
  if (!accountInfo) {
    console.log('❌ ERROR: Bonding curve account not found!');
    console.log('   This token may not be on Pump.fun\n');
    return;
  }
  
  const data = accountInfo.data;
  const accountBalance = accountInfo.lamports / 1e9;
  
  console.log('✅ Bonding curve found!');
  console.log('   Account Balance:', accountBalance.toFixed(9), 'SOL');
  console.log('   Data Length:', data.length, 'bytes\n');
  
  console.log('================================================');
  console.log('CHECKING ALL POSSIBLE FEE OFFSETS');
  console.log('================================================\n');
  
  // Check all u64 values at 8-byte intervals
  const offsets = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96];
  
  console.log('Offset | Value (lamports)           | As SOL');
  console.log('-------|----------------------------|------------------');
  
  for (const offset of offsets) {
    try {
      const value = data.readBigUInt64LE(offset);
      const asSol = Number(value) / 1e9;
      
      // Highlight the offset we're using (32)
      const marker = offset === 32 ? ' ⬅️ WE READ THIS' : '';
      
      console.log(
        String(offset).padStart(6) + ' | ' +
        value.toString().padEnd(26) + ' | ' +
        asSol.toFixed(9).padStart(16) + ' SOL' +
        marker
      );
    } catch (e) {
      console.log(String(offset).padStart(6) + ' | ERROR reading data');
    }
  }
  
  console.log('\n================================================');
  console.log('ANALYSIS');
  console.log('================================================\n');
  
  // Read what we think are claimable fees (offset 32)
  const claimableFeesLamports = data.readBigUInt64LE(32);
  const claimableFees = Number(claimableFeesLamports) / 1e9;
  
  console.log('Current system reads offset 32 as claimable fees:');
  console.log('   Claimable Fees:', claimableFees.toFixed(9), 'SOL\n');
  
  console.log('Your threshold settings:');
  console.log('   CLAIM_THRESHOLD_SOL:', process.env.CLAIM_THRESHOLD_SOL, 'SOL\n');
  
  if (claimableFees >= parseFloat(process.env.CLAIM_THRESHOLD_SOL || '0.01')) {
    console.log('⚠️  WOULD TRIGGER CLAIM');
    console.log('   Fees (' + claimableFees.toFixed(9) + ') >= Threshold (' + process.env.CLAIM_THRESHOLD_SOL + ')');
  } else {
    console.log('✅ BELOW THRESHOLD - No claim would trigger');
    console.log('   Fees (' + claimableFees.toFixed(9) + ') < Threshold (' + process.env.CLAIM_THRESHOLD_SOL + ')');
  }
  
  console.log('\n================================================');
  console.log('LIKELY EXPLANATION');
  console.log('================================================\n');
  
  if (claimableFees === 0) {
    console.log('✅ Offset 32 shows 0 SOL - this is correct');
    console.log('   No fees accumulated yet.');
  } else if (claimableFees < 0.0001) {
    console.log('⚠️  Offset 32 shows very small amount');
    console.log('   This might be rent or dust, not actual claimable fees.');
  } else if (claimableFees > 0.01 && claimableFees < accountBalance) {
    console.log('❓ Offset 32 shows:', claimableFees.toFixed(9), 'SOL');
    console.log('   This MIGHT be actual claimable fees...');
    console.log('   OR it could be reserves/liquidity being misread.');
  } else if (claimableFees >= accountBalance) {
    console.log('❌ Offset 32 shows amount >= account balance');
    console.log('   This is WRONG - likely reading wrong offset!');
    console.log('   The correct offset for your token might be different.');
  }
  
  console.log('\n================================================\n');
}

diagnose().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err);
});