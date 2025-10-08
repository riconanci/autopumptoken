/**
 * Check current claimable rewards without claiming
 * Run: node check-rewards-now.js
 */

require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

const MINT = process.env.TOKEN_MINT;
const RPC = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function checkRewards() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║       CHECKING CLAIMABLE REWARDS (NO CLAIM)              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  const connection = new Connection(RPC, 'confirmed');
  const mintPubkey = new PublicKey(MINT);
  
  const [bondingCurve] = await PublicKey.findProgramAddress(
    [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
    PUMP_PROGRAM_ID
  );
  
  console.log('🔗 Token:', MINT);
  console.log('🔗 Bonding Curve:', bondingCurve.toString());
  console.log('🔗 Dashboard:', `https://pump.fun/coin/${MINT}\n`);
  
  const accountInfo = await connection.getAccountInfo(bondingCurve);
  
  if (!accountInfo) {
    console.log('❌ Bonding curve not found!\n');
    return;
  }
  
  const data = accountInfo.data;
  const accountBalance = accountInfo.lamports / 1e9;
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 BONDING CURVE DATA');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('Account Balance:', accountBalance.toFixed(9), 'SOL\n');
  
  console.log('Key Offsets:');
  const offsets = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96];
  
  for (const offset of offsets) {
    if (offset + 8 <= data.length) {
      try {
        const value = data.readBigUInt64LE(offset);
        const asSol = Number(value) / 1e9;
        
        let label = `Offset ${String(offset).padStart(2)}`;
        let marker = '';
        
        if (offset === 32) {
          label = '→ Offset 32 (our calc uses)';
          marker = ' ⬅️';
        } else if (offset === 88) {
          label = '  Offset 88 (tried before)';
          marker = asSol === 0 ? ' (zero)' : '';
        }
        
        console.log(`  ${label}: ${asSol.toFixed(9).padStart(15)} SOL${marker}`);
      } catch (e) {
        console.log(`  Offset ${String(offset).padStart(2)}: ERROR`);
      }
    }
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧮 OUR CALCULATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const offset32 = Number(data.readBigUInt64LE(32)) / 1e9;
  const ourCalculation = Math.max(0, accountBalance - offset32);
  
  console.log('Method: Balance - Offset 32');
  console.log(`  ${accountBalance.toFixed(9)} - ${offset32.toFixed(9)} = ${ourCalculation.toFixed(9)} SOL\n`);
  
  const threshold = parseFloat(process.env.CLAIM_THRESHOLD_SOL || '0.01');
  console.log('Your threshold:', threshold, 'SOL');
  console.log('Meets threshold?', ourCalculation >= threshold ? '✅ YES (would claim)' : '❌ NO (would wait)\n');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ NEXT STEPS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('1. Check your Pump.fun dashboard:');
  console.log('   ' + `https://pump.fun/coin/${MINT}`);
  console.log('\n2. Compare the "unclaimed" amount:');
  console.log(`   Dashboard shows: _______ SOL`);
  console.log(`   Our calc shows:  ${ourCalculation.toFixed(6)} SOL\n`);
  
  console.log('3. Do they match?');
  console.log('   ✅ YES → Calculation is correct!');
  console.log('   ❌ NO  → We need to find the right offset\n');
  
  if (ourCalculation > 0 && ourCalculation < 0.01) {
    console.log('⚠️  Small amount detected!');
    console.log('   This could be:');
    console.log('   • Real small fees that accumulated');
    console.log('   • A calculation error (check dashboard!)');
    console.log('   • Dust/rounding from previous operations\n');
  }
  
  if (ourCalculation >= threshold) {
    console.log('🎯 READY TO CLAIM!');
    console.log('   Your system will automatically claim in the next cycle');
    console.log('   OR you can trigger manually:\n');
    console.log('   curl -X POST http://localhost:3000/api/claim \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{"adminApiKey": "YOUR_KEY", "force": true}\'\n');
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

checkRewards().catch(err => {
  console.error('\n❌ Error:', err.message);
  console.error(err);
  process.exit(1);
});