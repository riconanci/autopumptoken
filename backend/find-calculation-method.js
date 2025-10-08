/**
 * Try all possible calculation methods to find how to get 0.006 SOL
 * Run: node find-calculation-method.js
 */

require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

const MINT = process.env.TOKEN_MINT;
const RPC = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// The dashboard shows this exact value
const TARGET_UNCLAIMED = 0.006;
const TOLERANCE = 0.0001; // 0.0001 SOL tolerance

async function findCalculationMethod() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('FINDING THE CALCULATION METHOD');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('Dashboard shows: 0.006 SOL unclaimed');
  console.log('Searching for calculation that gives us this value...\n');
  
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
  
  console.log('Bonding Curve:', bondingCurve.toString());
  console.log('Account Balance:', accountBalance.toFixed(9), 'SOL');
  console.log('Data Length:', data.length, 'bytes\n');
  
  // Read all key offsets
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
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TRYING CALCULATION METHODS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  let found = false;
  const methods = [];
  
  // Method 1: Direct offset reading
  console.log('METHOD 1: Direct offset reading\n');
  for (const [offset, value] of Object.entries(offsets)) {
    if (value !== null) {
      const diff = Math.abs(value - TARGET_UNCLAIMED);
      if (diff < TOLERANCE) {
        console.log(`🎯 MATCH! Offset ${offset} = ${value.toFixed(9)} SOL`);
        methods.push({
          method: `Direct: offset ${offset}`,
          code: `data.readBigUInt64LE(${offset}) / 1e9`,
          result: value
        });
        found = true;
      }
    }
  }
  if (!found) console.log('   No direct matches found.\n');
  
  // Method 2: Balance minus single offset
  console.log('METHOD 2: Balance - single offset\n');
  found = false;
  for (const [offset, value] of Object.entries(offsets)) {
    if (value !== null) {
      const result = accountBalance - value;
      const diff = Math.abs(result - TARGET_UNCLAIMED);
      if (diff < TOLERANCE && result > 0) {
        console.log(`🎯 MATCH! Balance - offset ${offset} = ${result.toFixed(9)} SOL`);
        console.log(`   (${accountBalance.toFixed(9)} - ${value.toFixed(9)} = ${result.toFixed(9)})`);
        methods.push({
          method: `Balance - offset ${offset}`,
          code: `accountBalance - (data.readBigUInt64LE(${offset}) / 1e9)`,
          result: result
        });
        found = true;
      }
    }
  }
  if (!found) console.log('   No matches found.\n');
  
  // Method 3: Balance minus TWO offsets
  console.log('METHOD 3: Balance - (offset X + offset Y)\n');
  found = false;
  const offsetKeys = Object.keys(offsets).map(Number);
  for (let i = 0; i < offsetKeys.length; i++) {
    for (let j = i + 1; j < offsetKeys.length; j++) {
      const offset1 = offsetKeys[i];
      const offset2 = offsetKeys[j];
      const val1 = offsets[offset1];
      const val2 = offsets[offset2];
      
      if (val1 !== null && val2 !== null) {
        const result = accountBalance - val1 - val2;
        const diff = Math.abs(result - TARGET_UNCLAIMED);
        if (diff < TOLERANCE && result > 0) {
          console.log(`🎯 MATCH! Balance - offset ${offset1} - offset ${offset2} = ${result.toFixed(9)} SOL`);
          console.log(`   (${accountBalance.toFixed(9)} - ${val1.toFixed(9)} - ${val2.toFixed(9)})`);
          methods.push({
            method: `Balance - offset ${offset1} - offset ${offset2}`,
            code: `accountBalance - (data.readBigUInt64LE(${offset1}) / 1e9) - (data.readBigUInt64LE(${offset2}) / 1e9)`,
            result: result
          });
          found = true;
        }
      }
    }
  }
  if (!found) console.log('   No matches found.\n');
  
  // Method 4: Offset X minus offset Y
  console.log('METHOD 4: Offset X - Offset Y\n');
  found = false;
  for (let i = 0; i < offsetKeys.length; i++) {
    for (let j = 0; j < offsetKeys.length; j++) {
      if (i === j) continue;
      
      const offset1 = offsetKeys[i];
      const offset2 = offsetKeys[j];
      const val1 = offsets[offset1];
      const val2 = offsets[offset2];
      
      if (val1 !== null && val2 !== null) {
        const result = val1 - val2;
        const diff = Math.abs(result - TARGET_UNCLAIMED);
        if (diff < TOLERANCE && result > 0) {
          console.log(`🎯 MATCH! Offset ${offset1} - offset ${offset2} = ${result.toFixed(9)} SOL`);
          console.log(`   (${val1.toFixed(9)} - ${val2.toFixed(9)})`);
          methods.push({
            method: `Offset ${offset1} - offset ${offset2}`,
            code: `(data.readBigUInt64LE(${offset1}) / 1e9) - (data.readBigUInt64LE(${offset2}) / 1e9)`,
            result: result
          });
          found = true;
        }
      }
    }
  }
  if (!found) console.log('   No matches found.\n');
  
  // Method 5: Balance plus/minus combinations
  console.log('METHOD 5: Other combinations\n');
  found = false;
  for (const [offset, value] of Object.entries(offsets)) {
    if (value !== null) {
      // Try balance + offset (unusual but possible)
      const result = accountBalance + value;
      const diff = Math.abs(result - TARGET_UNCLAIMED);
      if (diff < TOLERANCE) {
        console.log(`🎯 MATCH! Balance + offset ${offset} = ${result.toFixed(9)} SOL`);
        methods.push({
          method: `Balance + offset ${offset}`,
          code: `accountBalance + (data.readBigUInt64LE(${offset}) / 1e9)`,
          result: result
        });
        found = true;
      }
    }
  }
  if (!found) console.log('   No matches found.\n');
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  if (methods.length === 0) {
    console.log('❌ NO CALCULATION METHODS FOUND!\n');
    console.log('This is very unusual. Possible reasons:');
    console.log('  1. The dashboard value might be cached/stale');
    console.log('  2. The bonding curve structure is different than expected');
    console.log('  3. We need to read from a different account\n');
    console.log('All offset values for reference:');
    for (const [offset, value] of Object.entries(offsets)) {
      if (value !== null) {
        console.log(`  Offset ${String(offset).padStart(3)}: ${value.toFixed(9)} SOL`);
      }
    }
  } else {
    console.log(`✅ FOUND ${methods.length} WORKING METHOD(S)!\n`);
    methods.forEach((m, i) => {
      console.log(`Method ${i + 1}: ${m.method}`);
      console.log(`  Result: ${m.result.toFixed(9)} SOL`);
      console.log(`  Code: ${m.code}\n`);
    });
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('UPDATE YOUR pumpfun.ts WITH:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('const claimableFees = ' + methods[0].code + ';\n');
  }
  
  console.log('═══════════════════════════════════════════════════════════\n');
}

findCalculationMethod().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err);
});