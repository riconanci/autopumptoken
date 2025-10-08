/**
 * Debug script to check claimable fees
 * Run: node check-fees.js
 */

require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

const MINT = process.env.TOKEN_MINT;
const RPC = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function checkFees() {
  console.log('Checking claimable fees...\n');
  console.log('Token:', MINT);
  console.log('RPC:', RPC);
  console.log('Threshold:', process.env.CLAIM_THRESHOLD_SOL, 'SOL\n');

  const connection = new Connection(RPC);

  try {
    // Derive bonding curve PDA
    const mintPubkey = new PublicKey(MINT);
    const [bondingCurve] = await PublicKey.findProgramAddress(
      [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
      PUMP_PROGRAM_ID
    );

    console.log('Bonding Curve Address:', bondingCurve.toString(), '\n');

    // Get account info
    const accountInfo = await connection.getAccountInfo(bondingCurve);

    if (!accountInfo) {
      console.log('❌ Bonding curve account not found!');
      console.log('   This token might not be on Pump.fun or the bonding curve is closed.\n');
      return;
    }

    console.log('✅ Bonding curve found!\n');

    // Parse data
    const data = accountInfo.data;
    const accountBalance = accountInfo.lamports / 1e9;
    const realSolReserves = Number(data.readBigUInt64LE(56)) / 1e9;
    const claimableFees = Math.max(0, accountBalance - realSolReserves);

    console.log('Account Details:');
    console.log('  Total Balance:', accountBalance.toFixed(6), 'SOL');
    console.log('  Real Reserves:', realSolReserves.toFixed(6), 'SOL');
    console.log('  Claimable Fees:', claimableFees.toFixed(6), 'SOL');
    console.log('');

    const threshold = parseFloat(process.env.CLAIM_THRESHOLD_SOL || '0.05');
    
    if (claimableFees >= threshold) {
      console.log('✅ READY TO CLAIM!');
      console.log(`   Fees (${claimableFees.toFixed(6)} SOL) >= Threshold (${threshold} SOL)`);
      console.log('');
      console.log('Your system should automatically claim these fees.');
      console.log('Check your server logs for the next monitoring cycle.');
    } else {
      console.log('⏳ Not ready yet');
      console.log(`   Fees (${claimableFees.toFixed(6)} SOL) < Threshold (${threshold} SOL)`);
      console.log(`   Need ${(threshold - claimableFees).toFixed(6)} more SOL`);
    }
    console.log('');

    // Additional debugging info
    console.log('Raw Data (first 80 bytes):');
    console.log('  Virtual Token Reserves:', data.readBigUInt64LE(8).toString());
    console.log('  Virtual SOL Reserves:', data.readBigUInt64LE(40).toString());
    console.log('  Real Token Reserves:', data.readBigUInt64LE(48).toString());
    console.log('  Real SOL Reserves:', data.readBigUInt64LE(56).toString());

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nFull error:', error);
  }
}

checkFees();