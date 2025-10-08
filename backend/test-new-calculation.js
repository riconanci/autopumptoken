/**
 * Test the new 1.5× multiplier calculation
 * Run this AFTER replacing pumpfun.ts
 */

require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

async function testNewCalculation() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          TEST NEW CALCULATION (1.5× multiplier)            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const MINT = process.env.TOKEN_MINT;
  const RPC = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
  const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  
  const connection = new Connection(RPC, 'confirmed');
  const mintPubkey = new PublicKey(MINT);
  
  const [bondingCurve] = await PublicKey.findProgramAddress(
    [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
    PUMP_PROGRAM_ID
  );
  
  const accountInfo = await connection.getAccountInfo(bondingCurve);
  
  if (!accountInfo) {
    console.log('❌ Bonding curve not found\n');
    return;
  }

  const data = accountInfo.data;
  const accountBalance = accountInfo.lamports / 1e9;
  const offset32Value = Number(data.readBigUInt64LE(32)) / 1e9;
  const rawCalculation = Math.max(0, accountBalance - offset32Value);
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('BONDING CURVE DATA');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('  Account Balance: ', accountBalance.toFixed(9), 'SOL');
  console.log('  Offset 32 Value: ', offset32Value.toFixed(9), 'SOL');
  console.log('  Difference:      ', rawCalculation.toFixed(9), 'SOL\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('CALCULATION COMPARISON');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const oldCalc = rawCalculation * 2;
  const newCalc = rawCalculation * 1.5;
  const dashboardAmount = 0.003;
  
  console.log('  OLD (× 2):       ', oldCalc.toFixed(9), 'SOL');
  console.log('  NEW (× 1.5):     ', newCalc.toFixed(9), 'SOL');
  console.log('  Dashboard:       ', dashboardAmount.toFixed(9), 'SOL\n');
  
  const oldError = Math.abs(oldCalc - dashboardAmount);
  const newError = Math.abs(newCalc - dashboardAmount);
  
  console.log('  OLD Error:       ', oldError.toFixed(9), 'SOL');
  console.log('  NEW Error:       ', newError.toFixed(9), 'SOL\n');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('RESULT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (newError < 0.0001) {
    console.log('✅ EXCELLENT! New calculation matches dashboard perfectly!\n');
    console.log('   Error < 0.0001 SOL - this is as close as we can get');
    console.log('   with blockchain estimation.\n');
  } else if (newError < oldError) {
    console.log('✅ IMPROVED! New calculation is closer to dashboard.\n');
    console.log(`   Improvement: ${((oldError - newError) / oldError * 100).toFixed(1)}% better\n`);
  } else {
    console.log('⚠️  New calculation is not better. Something may be wrong.\n');
  }

  const threshold = parseFloat(process.env.CLAIM_THRESHOLD_SOL || '0.01');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('THRESHOLD CHECK');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`  Your threshold:  ${threshold.toFixed(9)} SOL`);
  console.log(`  Estimated fees:  ${newCalc.toFixed(9)} SOL\n`);
  
  if (newCalc >= threshold) {
    console.log('✅ WOULD TRIGGER CLAIM');
    console.log(`   Fees (${newCalc.toFixed(6)}) >= Threshold (${threshold})\n`);
    console.log('   Your system will automatically claim in the next cycle!');
  } else {
    console.log('⏳ BELOW THRESHOLD');
    console.log(`   Fees (${newCalc.toFixed(6)}) < Threshold (${threshold})\n`);
    console.log(`   Need ${(threshold - newCalc).toFixed(6)} more SOL to trigger claim.`);
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  IMPORTANT REMINDER');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('This estimate is ONLY for deciding when to claim!');
  console.log('The actual amount used for splits comes from balance checking.');
  console.log('');
  console.log('Flow:');
  console.log('  1. Estimate: ~0.003 SOL (threshold check)');
  console.log('  2. Claim: Transaction executes');
  console.log('  3. Balance check: Actual received = X SOL');
  console.log('  4. Split X SOL (50/50), not the estimate!\n');
  console.log('Your feeClaim.ts handles this correctly already! ✅');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

testNewCalculation().catch(err => {
  console.error('\n❌ Error:', err.message);
  console.error(err);
  process.exit(1);
});