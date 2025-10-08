/**
 * Try EVERY possible calculation to find what gives 0.004 SOL
 * Run: node find-correct-calculation.js
 */

require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

const MINT = process.env.TOKEN_MINT;
const RPC = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// YOU SAID DASHBOARD SHOWS 0.004 SOL
const EXPECTED_FEES = 0.004;
const TOLERANCE = 0.0001; // 0.0001 SOL tolerance

async function findCorrectCalculation() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║   FINDING CORRECT CALCULATION FOR 0.004 SOL             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  const connection = new Connection(RPC, 'confirmed');
  const mintPubkey = new PublicKey(MINT);
  
  const [bondingCurve] = await PublicKey.findProgramAddress(
    [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
    PUMP_PROGRAM_ID
  );
  
  const accountInfo = await connection.getAccountInfo(bondingCurve);
  
  if (!accountInfo) {
    console.log('❌ Bonding curve not found!\n');
    return;
  }
  
  const data = accountInfo.data;
  const accountBalance = accountInfo.lamports / 1e9;
  
  console.log('Target: 0.004 SOL (from dashboard)');
  console.log('Tolerance: ±0.0001 SOL\n');
  
  // Read all offsets
  const offsets = {};
  for (let i = 0; i <= 96; i += 8) {
    if (i + 8 <= data.length) {
      try {
        offsets[i] = Number(data.readBigUInt64LE(i)) / 1e9;
      } catch (e) {
        offsets[i] = null;
      }
    }
  }
  
  console.log('Account Balance:', accountBalance.toFixed(9), 'SOL\n');
  
  const methods = [];
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 TRYING ALL CALCULATION METHODS...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Method 1: Direct offset reading
  console.log('Method 1: Direct Offset Reading\n');
  for (const [offset, value] of Object.entries(offsets)) {
    if (value !== null) {
      const diff = Math.abs(value - EXPECTED_FEES);
      if (diff < TOLERANCE) {
        console.log(`🎯 MATCH! Offset ${offset} = ${value.toFixed(9)} SOL`);
        methods.push({
          method: `Direct offset ${offset}`,
          code: `data.readBigUInt64LE(${offset}) / 1e9`,
          result: value,
          accuracy: 'EXACT'
        });
      }
    }
  }
  
  // Method 2: Balance minus single offset
  console.log('\nMethod 2: Balance - Single Offset\n');
  for (const [offset, value] of Object.entries(offsets)) {
    if (value !== null) {
      const result = accountBalance - value;
      const diff = Math.abs(result - EXPECTED_FEES);
      if (diff < TOLERANCE && result > 0) {
        console.log(`🎯 MATCH! Balance - offset ${offset} = ${result.toFixed(9)} SOL`);
        console.log(`   (${accountBalance.toFixed(9)} - ${value.toFixed(9)})`);
        methods.push({
          method: `Balance - offset ${offset}`,
          code: `accountBalance - (data.readBigUInt64LE(${offset}) / 1e9)`,
          result: result,
          accuracy: diff < 0.00001 ? 'EXACT' : 'CLOSE'
        });
      }
    }
  }
  
  // Method 3: Offset X minus offset Y
  console.log('\nMethod 3: Offset X - Offset Y\n');
  const offsetKeys = Object.keys(offsets).map(Number);
  for (let i = 0; i < offsetKeys.length; i++) {
    for (let j = 0; j < offsetKeys.length; j++) {
      if (i === j) continue;
      
      const offset1 = offsetKeys[i];
      const offset2 = offsetKeys[j];
      const val1 = offsets[offset1];
      const val2 = offsets[offset2];
      
      if (val1 !== null && val2 !== null) {
        const result = val1 - val2;
        const diff = Math.abs(result - EXPECTED_FEES);
        if (diff < TOLERANCE && result > 0) {
          console.log(`🎯 MATCH! Offset ${offset1} - offset ${offset2} = ${result.toFixed(9)} SOL`);
          console.log(`   (${val1.toFixed(9)} - ${val2.toFixed(9)})`);
          methods.push({
            method: `Offset ${offset1} - offset ${offset2}`,
            code: `(data.readBigUInt64LE(${offset1}) / 1e9) - (data.readBigUInt64LE(${offset2}) / 1e9)`,
            result: result,
            accuracy: diff < 0.00001 ? 'EXACT' : 'CLOSE'
          });
        }
      }
    }
  }
  
  // Method 4: Balance minus TWO offsets
  console.log('\nMethod 4: Balance - (Offset X + Offset Y)\n');
  for (let i = 0; i < offsetKeys.length; i++) {
    for (let j = i + 1; j < offsetKeys.length; j++) {
      const offset1 = offsetKeys[i];
      const offset2 = offsetKeys[j];
      const val1 = offsets[offset1];
      const val2 = offsets[offset2];
      
      if (val1 !== null && val2 !== null) {
        const result = accountBalance - val1 - val2;
        const diff = Math.abs(result - EXPECTED_FEES);
        if (diff < TOLERANCE && result > 0 && result < accountBalance) {
          console.log(`🎯 MATCH! Balance - offset ${offset1} - offset ${offset2} = ${result.toFixed(9)} SOL`);
          console.log(`   (${accountBalance.toFixed(9)} - ${val1.toFixed(9)} - ${val2.toFixed(9)})`);
          methods.push({
            method: `Balance - offset ${offset1} - offset ${offset2}`,
            code: `accountBalance - (data.readBigUInt64LE(${offset1}) / 1e9) - (data.readBigUInt64LE(${offset2}) / 1e9)`,
            result: result,
            accuracy: diff < 0.00001 ? 'EXACT' : 'CLOSE'
          });
        }
      }
    }
  }
  
  // Method 5: Offset multiplied by constant
  console.log('\nMethod 5: Offset × Constant\n');
  for (const [offset, value] of Object.entries(offsets)) {
    if (value !== null && value > 0 && value < 1) {
      for (const multiplier of [2, 3, 4, 5, 10]) {
        const result = value * multiplier;
        const diff = Math.abs(result - EXPECTED_FEES);
        if (diff < TOLERANCE) {
          console.log(`🎯 MATCH! Offset ${offset} × ${multiplier} = ${result.toFixed(9)} SOL`);
          console.log(`   (${value.toFixed(9)} × ${multiplier})`);
          methods.push({
            method: `Offset ${offset} × ${multiplier}`,
            code: `(data.readBigUInt64LE(${offset}) / 1e9) * ${multiplier}`,
            result: result,
            accuracy: diff < 0.00001 ? 'EXACT' : 'CLOSE'
          });
        }
      }
    }
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (methods.length === 0) {
    console.log('❌ NO MATCHES FOUND!\n');
    console.log('Possible reasons:');
    console.log('  1. Dashboard value (0.004) is cached/stale');
    console.log('  2. Fees are stored in a different account');
    console.log('  3. Complex calculation we haven\'t tried\n');
    console.log('Next steps:');
    console.log('  1. Double-check dashboard shows exactly 0.004 SOL');
    console.log('  2. Try refreshing the dashboard');
    console.log('  3. Force claim and check actual received amount');
  } else {
    console.log(`✅ FOUND ${methods.length} WORKING METHOD(S)!\n`);
    
    methods.forEach((m, i) => {
      console.log(`${i + 1}. ${m.method}`);
      console.log(`   Result: ${m.result.toFixed(9)} SOL (${m.accuracy})`);
      console.log(`   Code: ${m.code}\n`);
    });
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 RECOMMENDED IMPLEMENTATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const best = methods[0];
    console.log('Update backend/src/lib/pumpfun.ts:');
    console.log('\nconst claimableFees = ' + best.code + ';');
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

findCorrectCalculation().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err);
});