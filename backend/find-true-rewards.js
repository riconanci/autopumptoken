/**
 * Find the TRUE claimable rewards for your token
 * This script will show ALL possible values and help identify the correct offset
 * 
 * USAGE:
 * 1. Check your Pump.fun dashboard and note the EXACT unclaimed amount
 * 2. Run: node find-true-rewards.js
 * 3. Compare the output with your dashboard value
 * 4. The matching offset is your answer!
 */

require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

async function findTrueRewards() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          FIND TRUE CLAIMABLE REWARDS                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const MINT = process.env.TOKEN_MINT;
  const RPC = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
  const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  
  console.log('Token Mint:', MINT);
  console.log('Pump.fun URL: https://pump.fun/coin/' + MINT);
  console.log('\n⚠️  IMPORTANT: Check the dashboard NOW and note the "unclaimed" amount!\n');

  const connection = new Connection(RPC, 'confirmed');
  const mintPubkey = new PublicKey(MINT);
  
  // Get bonding curve PDA
  const [bondingCurve] = await PublicKey.findProgramAddress(
    [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
    PUMP_PROGRAM_ID
  );
  
  console.log('Bonding Curve:', bondingCurve.toString(), '\n');
  
  const accountInfo = await connection.getAccountInfo(bondingCurve);
  
  if (!accountInfo) {
    console.log('❌ ERROR: Bonding curve not found!\n');
    return;
  }

  const data = accountInfo.data;
  const accountBalance = accountInfo.lamports / 1e9;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('ACCOUNT INFORMATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('  Account Balance:', accountBalance.toFixed(9), 'SOL');
  console.log('  Data Length:', data.length, 'bytes\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('ALL POSSIBLE VALUES (reading every u64 as SOL)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Offset | Lamports                 | SOL Amount       | Notes');
  console.log('-------|--------------------------|------------------|----------------');

  const values = {};
  
  // Read ALL u64 values at 8-byte intervals
  for (let offset = 0; offset <= Math.min(120, data.length - 8); offset += 8) {
    try {
      const lamports = data.readBigUInt64LE(offset);
      const sol = Number(lamports) / 1e9;
      values[offset] = sol;
      
      let notes = '';
      
      // Highlight likely candidates
      if (sol > 0 && sol < accountBalance && sol < 1) {
        notes = '← POSSIBLE';
      }
      if (offset === 32) {
        notes = '← Currently using (WRONG?)';
      }
      if (offset === 88) {
        notes = '← Previously tried';
      }
      
      console.log(
        String(offset).padStart(6) + ' | ' +
        lamports.toString().padEnd(24) + ' | ' +
        sol.toFixed(9).padStart(16) + ' | ' +
        notes
      );
    } catch (e) {
      console.log(String(offset).padStart(6) + ' | ERROR reading');
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('CURRENT CALCULATION (what your system uses now)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const offset32 = values[32] || 0;
  const currentCalc = Math.max(0, accountBalance - offset32) * 2;
  
  console.log('  Formula: (Balance - Offset 32) × 2');
  console.log('  Result: ', currentCalc.toFixed(9), 'SOL');
  console.log('  (', accountBalance.toFixed(9), '-', offset32.toFixed(9), ') × 2 =', currentCalc.toFixed(9), '\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 FIND YOUR MATCH');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('1. Look at your Pump.fun dashboard:');
  console.log('   https://pump.fun/coin/' + MINT);
  console.log('\n2. What does the "unclaimed" amount show?');
  console.log('   Dashboard shows: _______ SOL\n');
  
  console.log('3. Find that amount in the table above!');
  console.log('   Look for the row where SOL Amount matches.\n');
  
  console.log('4. Possible scenarios:\n');
  
  // Check for likely matches
  const candidates = Object.entries(values)
    .filter(([offset, sol]) => sol > 0 && sol < accountBalance && sol < 1)
    .sort((a, b) => b[1] - a[1]);
  
  if (candidates.length === 0) {
    console.log('   ❌ No obvious candidates found');
    console.log('   → Dashboard probably shows $0.00 (no fees yet)');
    console.log('   → Or fees are very small (< 0.001 SOL)\n');
  } else {
    console.log('   Top candidates:\n');
    candidates.forEach(([offset, sol]) => {
      console.log(`   • Offset ${offset}: ${sol.toFixed(9)} SOL`);
    });
    console.log();
  }
  
  // Try some common calculations
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('OTHER CALCULATION METHODS TO TRY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const methods = [];
  
  // Method 1: Direct offset reading
  [16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96].forEach(offset => {
    if (values[offset] > 0 && values[offset] < 1) {
      methods.push({
        name: `Direct read offset ${offset}`,
        result: values[offset],
        code: `data.readBigUInt64LE(${offset}) / 1e9`
      });
    }
  });
  
  // Method 2: Balance minus offset
  [16, 24, 32, 40, 48, 56].forEach(offset => {
    const result = Math.max(0, accountBalance - values[offset]);
    if (result > 0 && result < accountBalance && result < 1) {
      methods.push({
        name: `Balance - Offset ${offset}`,
        result: result,
        code: `accountBalance - (data.readBigUInt64LE(${offset}) / 1e9)`
      });
    }
  });
  
  // Method 3: Offset divided by constant
  [16, 24, 32, 40, 48].forEach(offset => {
    [2, 3, 4, 5, 10].forEach(divisor => {
      const result = values[offset] / divisor;
      if (result > 0 && result < 1) {
        methods.push({
          name: `Offset ${offset} ÷ ${divisor}`,
          result: result,
          code: `(data.readBigUInt64LE(${offset}) / 1e9) / ${divisor}`
        });
      }
    });
  });
  
  // Display methods
  const uniqueMethods = methods
    .filter((m, i, arr) => 
      arr.findIndex(x => Math.abs(x.result - m.result) < 0.000001) === i
    )
    .sort((a, b) => b.result - a.result)
    .slice(0, 10);
  
  if (uniqueMethods.length > 0) {
    console.log('Here are different calculation methods to try:\n');
    uniqueMethods.forEach((m, i) => {
      console.log(`${i + 1}. ${m.name}`);
      console.log(`   Result: ${m.result.toFixed(9)} SOL`);
      console.log(`   Code: ${m.code}\n`);
    });
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📝 NEXT STEPS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('1. Compare dashboard value with the table above');
  console.log('2. Find which offset or calculation matches EXACTLY');
  console.log('3. Tell me: "The dashboard shows X SOL and offset Y matches"');
  console.log('4. I\'ll update your pumpfun.ts with the correct code!\n');
  
  console.log('If no exact match:');
  console.log('  • Dashboard might be cached (refresh it)');
  console.log('  • Fees might be in a different account');
  console.log('  • Try running with different thresholds to test\n');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

findTrueRewards().catch(err => {
  console.error('\n❌ Error:', err.message);
  console.error(err);
  process.exit(1);
});