/**
 * Find the field that directly stores creator fees
 * Run: node find-fees-field.js
 */

require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

const MINT = process.env.TOKEN_MINT || '9AV236iTUAhkJz2vwjKW8rCTsgH7TDNU9CiY67M4pump';
const RPC = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function findFeesField() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('SEARCHING FOR DIRECT CREATOR FEES FIELD');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const connection = new Connection(RPC, 'confirmed');
  const mintPubkey = new PublicKey(MINT);
  
  const [bondingCurve] = await PublicKey.findProgramAddress(
    [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
    PUMP_PROGRAM_ID
  );
  
  const accountInfo = await connection.getAccountInfo(bondingCurve);
  const data = accountInfo.data;
  const accountBalanceLamports = accountInfo.lamports;
  const accountBalanceSOL = accountBalanceLamports / 1e9;
  
  console.log('Account Balance:', accountBalanceLamports, 'lamports');
  console.log('Account Balance:', accountBalanceSOL.toFixed(9), 'SOL');
  console.log('\nYou said actual claimable: 0.01005 SOL');
  console.log('That is:', Math.round(0.01005 * 1e9), 'lamports\n');
  
  const targetFeesLamports = Math.round(0.01005 * 1e9); // 10,050,000
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('SEARCHING FOR', targetFeesLamports, 'LAMPORTS (±5%)');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  let found = false;
  
  // Check all u64 offsets
  for (let offset = 0; offset <= data.length - 8; offset += 8) {
    const value = data.readBigUInt64LE(offset);
    const asLamports = Number(value);
    const asSol = asLamports / 1e9;
    
    // Check if within 5% of target
    const diff = Math.abs(asLamports - targetFeesLamports);
    const percentDiff = (diff / targetFeesLamports) * 100;
    
    if (percentDiff < 5) {
      console.log('🎯 MATCH FOUND!');
      console.log('  Offset:', offset);
      console.log('  Value:', asLamports, 'lamports');
      console.log('  Value:', asSol.toFixed(9), 'SOL');
      console.log('  Difference from expected:', diff, 'lamports');
      console.log('  ✅ THIS IS LIKELY THE CREATOR FEES FIELD!\n');
      found = true;
    }
  }
  
  if (!found) {
    console.log('❌ No exact match found. Showing all reasonable values:\n');
    
    for (let offset = 0; offset <= data.length - 8; offset += 8) {
      const value = data.readBigUInt64LE(offset);
      const asLamports = Number(value);
      const asSol = asLamports / 1e9;
      
      // Show values between 0.001 and 0.1 SOL
      if (asSol > 0.001 && asSol < 0.1) {
        console.log(`Offset ${String(offset).padStart(3)}:`,
                    String(asLamports).padStart(12), 'lamports →',
                    String(asSol.toFixed(9)).padStart(15), 'SOL');
      }
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('BONDING CURVE DATA LAYOUT (best guess)');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log('Common Pump.fun structure:');
  console.log('  Offset 0-7:   Virtual token reserves');
  console.log('  Offset 8-15:  Virtual SOL reserves');
  console.log('  Offset 16-23: Real token reserves');
  console.log('  Offset 24-31: Real SOL reserves');
  console.log('  Offset 32-39: Creator fees (?) ← LOOKING FOR THIS');
  console.log('  ...\n');
  
  console.log('Values found at key offsets:');
  for (const offset of [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80]) {
    if (offset + 8 <= data.length) {
      const value = data.readBigUInt64LE(offset);
      const asSol = Number(value) / 1e9;
      console.log(`  Offset ${String(offset).padStart(2)}:`, 
                  String(asSol.toFixed(9)).padStart(18), 'SOL');
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
}

findFeesField().catch(console.error);