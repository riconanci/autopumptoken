/**
 * Deep diagnostic - understand how reserves are encoded
 * Run: node deep-diagnostic.js
 */

require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

const MINT = process.env.TOKEN_MINT || '9AV236iTUAhkJz2vwjKW8rCTsgH7TDNU9CiY67M4pump';
const RPC = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function deepDiagnostic() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('DEEP RESERVE ENCODING DIAGNOSTIC');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const connection = new Connection(RPC, 'confirmed');
  const mintPubkey = new PublicKey(MINT);
  
  const [bondingCurve] = await PublicKey.findProgramAddress(
    [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
    PUMP_PROGRAM_ID
  );
  
  const accountInfo = await connection.getAccountInfo(bondingCurve);
  
  if (!accountInfo) {
    console.log('❌ Bonding curve not found!');
    return;
  }
  
  const data = accountInfo.data;
  const accountBalanceLamports = accountInfo.lamports;
  const accountBalanceSOL = accountBalanceLamports / 1e9;
  
  console.log('Account Balance:', accountBalanceLamports, 'lamports');
  console.log('Account Balance:', accountBalanceSOL.toFixed(9), 'SOL');
  console.log('\nYou said claimable should be: 0.01935 SOL');
  console.log('That means reserves should be:', (accountBalanceSOL - 0.01935).toFixed(9), 'SOL');
  console.log('Which is:', Math.round((accountBalanceSOL - 0.01935) * 1e9), 'lamports\n');
  
  const targetReservesLamports = Math.round((accountBalanceSOL - 0.01935) * 1e9);
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('SEARCHING FOR', targetReservesLamports, 'LAMPORTS IN DATA');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Try all possible u64 offsets
  for (let offset = 0; offset <= data.length - 8; offset += 8) {
    try {
      const value = data.readBigUInt64LE(offset);
      const asLamports = Number(value);
      const asSol = asLamports / 1e9;
      
      // Check if this matches our target (within 1% tolerance)
      const diff = Math.abs(asLamports - targetReservesLamports);
      const percentDiff = (diff / targetReservesLamports) * 100;
      
      if (percentDiff < 1) {
        console.log('🎯 MATCH FOUND!');
        console.log('  Offset:', offset);
        console.log('  Value:', asLamports, 'lamports');
        console.log('  Value:', asSol.toFixed(9), 'SOL');
        console.log('  Claimable:', (accountBalanceSOL - asSol).toFixed(9), 'SOL');
        console.log('  ✅ This is the correct offset!\n');
      }
    } catch (e) {
      // Skip
    }
  }
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('ALL U64 VALUES (for reference)');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  for (let offset = 0; offset <= data.length - 8; offset += 8) {
    try {
      const value = data.readBigUInt64LE(offset);
      const asLamports = Number(value);
      const asSol = asLamports / 1e9;
      const claimable = accountBalanceSOL - asSol;
      
      console.log(`Offset ${String(offset).padStart(3)}:`,
                  String(asLamports).padStart(20), 'lamports →',
                  String(asSol.toFixed(9)).padStart(15), 'SOL →',
                  'claimable:', String(claimable.toFixed(9)).padStart(15), 'SOL');
    } catch (e) {
      // Skip
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
}

deepDiagnostic().catch(console.error);