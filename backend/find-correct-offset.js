/**
 * Find which offset contains the actual claimable fees
 * Run: node find-correct-offset.js
 */

require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

const MINT = process.env.TOKEN_MINT;
const RPC = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function findCorrectOffset() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('FINDING CORRECT OFFSET FOR CLAIMABLE FEES');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // YOU SAID YOU HAVE 0.006 SOL CLAIMABLE
  const EXPECTED_FEES = 0.006;
  const targetFeesLamports = Math.round(EXPECTED_FEES * 1e9); // 6,000,000
  
  console.log('Looking for:', EXPECTED_FEES, 'SOL');
  console.log('Which is:', targetFeesLamports, 'lamports');
  console.log('Tolerance: ±10%\n');
  
  const connection = new Connection(RPC, 'confirmed');
  const mintPubkey = new PublicKey(MINT);
  
  const [bondingCurve] = await PublicKey.findProgramAddress(
    [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
    PUMP_PROGRAM_ID
  );
  
  console.log('Bonding Curve:', bondingCurve.toString(), '\n');
  
  const accountInfo = await connection.getAccountInfo(bondingCurve);
  
  if (!accountInfo) {
    console.log('❌ Bonding curve not found!\n');
    return;
  }
  
  const data = accountInfo.data;
  const accountBalance = accountInfo.lamports / 1e9;
  
  console.log('Account Balance:', accountBalance.toFixed(9), 'SOL');
  console.log('Data Length:', data.length, 'bytes\n');
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('SCANNING ALL OFFSETS...');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  let found = false;
  const matches = [];
  
  // Check all u64 offsets (every 8 bytes)
  for (let offset = 0; offset <= data.length - 8; offset += 8) {
    try {
      const value = data.readBigUInt64LE(offset);
      const asLamports = Number(value);
      const asSol = asLamports / 1e9;
      
      // Check if within 10% of target
      const diff = Math.abs(asLamports - targetFeesLamports);
      const percentDiff = (diff / targetFeesLamports) * 100;
      
      if (percentDiff < 10) {
        found = true;
        matches.push({
          offset,
          lamports: asLamports,
          sol: asSol,
          diffPercent: percentDiff
        });
        
        console.log('🎯 POTENTIAL MATCH!');
        console.log('   Offset:', offset);
        console.log('   Value:', asLamports, 'lamports');
        console.log('   Value:', asSol.toFixed(9), 'SOL');
        console.log('   Difference:', percentDiff.toFixed(2) + '%');
        console.log('   ✅ THIS COULD BE THE FEES FIELD!\n');
      }
    } catch (e) {
      // Skip invalid offsets
    }
  }
  
  if (!found) {
    console.log('❌ No close matches found!\n');
    console.log('Showing all values between 0.001 and 0.1 SOL:\n');
    
    for (let offset = 0; offset <= data.length - 8; offset += 8) {
      try {
        const value = data.readBigUInt64LE(offset);
        const asSol = Number(value) / 1e9;
        
        if (asSol > 0.001 && asSol < 0.1) {
          console.log(`Offset ${String(offset).padStart(3)}: ${asSol.toFixed(9)} SOL`);
        }
      } catch (e) {
        // Skip
      }
    }
  } else {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    if (matches.length === 1) {
      console.log('✅ FOUND EXACTLY ONE MATCH!');
      console.log('\n   UPDATE YOUR CODE TO USE:');
      console.log(`   const unclaimedFeesLamports = data.readBigUInt64LE(${matches[0].offset});`);
      console.log('\n   This offset contains:', matches[0].sol.toFixed(9), 'SOL');
    } else {
      console.log('⚠️  Found', matches.length, 'potential matches:');
      matches.forEach((m, i) => {
        console.log(`\n   ${i + 1}. Offset ${m.offset}: ${m.sol.toFixed(9)} SOL (${m.diffPercent.toFixed(2)}% diff)`);
      });
      console.log('\n   Try the LOWEST offset first (usually the correct one)');
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('ALL KEY OFFSETS (for reference)');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const keyOffsets = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96];
  console.log('Offset | Value (SOL)');
  console.log('-------|------------------');
  
  keyOffsets.forEach(offset => {
    if (offset + 8 <= data.length) {
      try {
        const value = data.readBigUInt64LE(offset);
        const asSol = Number(value) / 1e9;
        const marker = matches.some(m => m.offset === offset) ? ' ← MATCH' : '';
        console.log(`  ${String(offset).padStart(3)}  | ${asSol.toFixed(9)}${marker}`);
      } catch (e) {
        console.log(`  ${String(offset).padStart(3)}  | ERROR`);
      }
    }
  });
  
  console.log('\n═══════════════════════════════════════════════════════════\n');
}

findCorrectOffset().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err);
});