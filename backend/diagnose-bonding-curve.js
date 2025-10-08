/**
 * Diagnostic script to find correct offsets in bonding curve data
 * Run: node diagnose-bonding-curve.js
 */

require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

const MINT = process.env.TOKEN_MINT || '9AV236iTUAhkJz2vwjKW8rCTsgH7TDNU9CiY67M4pump';
const RPC = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function diagnoseCurve() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('BONDING CURVE DATA STRUCTURE ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const connection = new Connection(RPC, 'confirmed');
  const mintPubkey = new PublicKey(MINT);
  
  console.log('Token Mint:', MINT);
  
  const [bondingCurve] = await PublicKey.findProgramAddress(
    [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
    PUMP_PROGRAM_ID
  );
  
  console.log('Bonding Curve PDA:', bondingCurve.toString(), '\n');
  
  const accountInfo = await connection.getAccountInfo(bondingCurve);
  
  if (!accountInfo) {
    console.log('❌ Bonding curve not found!');
    return;
  }
  
  const data = accountInfo.data;
  const accountBalance = accountInfo.lamports;
  const accountBalanceSOL = accountBalance / 1e9;
  
  console.log('Account Balance:', accountBalance, 'lamports');
  console.log('Account Balance:', accountBalanceSOL.toFixed(9), 'SOL');
  console.log('Data Length:', data.length, 'bytes\n');
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('SEARCHING FOR REASONABLE SOL AMOUNTS');
  console.log('(Looking for values between 0 and account balance)');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const candidates = [];
  
  // Try all possible u64 offsets
  for (let offset = 0; offset <= data.length - 8; offset += 8) {
    try {
      const value = data.readBigUInt64LE(offset);
      const asSol = Number(value) / 1e9;
      
      // Must be positive and less than account balance
      if (asSol > 0 && asSol <= accountBalanceSOL && asSol < 100) {
        candidates.push({
          offset,
          lamports: value.toString(),
          sol: asSol
        });
        
        console.log(`Offset ${String(offset).padStart(3)}:`,
                    String(asSol.toFixed(9)).padStart(18), 'SOL',
                    '← CANDIDATE');
      }
    } catch (e) {
      // Skip invalid reads
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  if (candidates.length === 0) {
    console.log('❌ No reasonable SOL amounts found in bonding curve data!');
    console.log('   This could mean:');
    console.log('   1. The bonding curve structure is different than expected');
    console.log('   2. The token may not have active trading');
    console.log('   3. All reserves have been claimed already\n');
    
    console.log('FALLBACK APPROACH:');
    console.log('Since we can\'t find reserve data, use this simple formula:');
    console.log('  claimableFees = accountBalance - minRentExempt');
    console.log('  claimableFees = ' + accountBalanceSOL.toFixed(9) + ' - 0.002');
    console.log('  claimableFees = ' + (accountBalanceSOL - 0.002).toFixed(9) + ' SOL\n');
    
  } else {
    console.log('Found', candidates.length, 'candidate value(s) for reserves:\n');
    
    candidates.forEach((c, i) => {
      const claimable = accountBalanceSOL - c.sol;
      console.log(`Candidate ${i + 1}:`);
      console.log('  Offset:', c.offset);
      console.log('  Reserve Amount:', c.sol.toFixed(9), 'SOL');
      console.log('  Claimable Fees:', claimable.toFixed(9), 'SOL');
      console.log('  Formula: accountBalance(' + accountBalanceSOL.toFixed(9) + ') - reserve(' + c.sol.toFixed(9) + ')');
      console.log('');
    });
    
    console.log('RECOMMENDATION:');
    if (candidates.length === 1) {
      console.log('  ✓ Use offset', candidates[0].offset);
      console.log('  ✓ Claimable fees:', (accountBalanceSOL - candidates[0].sol).toFixed(9), 'SOL');
    } else {
      // The largest reserve value is most likely correct
      // (smallest claimable amount is most conservative)
      const best = candidates.reduce((max, c) => c.sol > max.sol ? c : max);
      console.log('  ✓ Most likely correct: offset', best.offset);
      console.log('  ✓ Reserve amount:', best.sol.toFixed(9), 'SOL');
      console.log('  ✓ Claimable fees:', (accountBalanceSOL - best.sol).toFixed(9), 'SOL');
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('RAW DATA HEX DUMP (first 128 bytes)');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const hexLines = data.slice(0, 128).toString('hex').match(/.{1,64}/g);
  hexLines.forEach((line, i) => {
    console.log(`${String(i * 32).padStart(3)}:`, line);
  });
  
  console.log('\n═══════════════════════════════════════════════════════════');
}

diagnoseCurve().catch(console.error);