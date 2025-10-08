/**
 * Analyze bonding curve data structure
 * Run: node analyze-curve.js
 */

require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

const MINT = process.env.TOKEN_MINT;
const RPC = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function analyzeCurve() {
  console.log('Analyzing bonding curve data structure...\n');

  const connection = new Connection(RPC);
  const mintPubkey = new PublicKey(MINT);
  
  const [bondingCurve] = await PublicKey.findProgramAddress(
    [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
    PUMP_PROGRAM_ID
  );

  const accountInfo = await connection.getAccountInfo(bondingCurve);
  
  if (!accountInfo) {
    console.log('Bonding curve not found');
    return;
  }

  const data = accountInfo.data;
  const accountBalance = accountInfo.lamports;

  console.log('Bonding Curve:', bondingCurve.toString());
  console.log('Account Balance:', accountBalance, 'lamports (', (accountBalance / 1e9).toFixed(6), 'SOL )');
  console.log('Data Length:', data.length, 'bytes\n');

  console.log('=== HEX DUMP (first 128 bytes) ===');
  console.log(data.slice(0, 128).toString('hex').match(/.{1,32}/g).join('\n'));
  console.log('');

  console.log('=== TRYING DIFFERENT OFFSETS FOR SOL AMOUNT ===\n');
  
  // Try reading u64 at different offsets
  for (let offset = 0; offset < Math.min(100, data.length - 8); offset += 8) {
    const value = data.readBigUInt64LE(offset);
    const asSol = Number(value) / 1e9;
    
    // Check if this could be a SOL amount (reasonable range)
    if (asSol > 0 && asSol < 1000) {
      console.log(`Offset ${offset}:`.padEnd(15), 
                  value.toString().padEnd(25), 
                  '→', asSol.toFixed(9), 'SOL',
                  asSol < accountBalance / 1e9 ? '✓ (possible)' : '');
    }
  }

  console.log('\n=== LOOKING FOR CREATOR ADDRESS ===\n');
  
  // Try to find 32-byte pubkeys
  for (let offset = 0; offset < data.length - 32; offset++) {
    try {
      const pubkey = new PublicKey(data.slice(offset, offset + 32));
      const pubkeyStr = pubkey.toString();
      
      // Check if it looks like a valid address (not all zeros, etc)
      if (pubkeyStr !== '11111111111111111111111111111111' && 
          !pubkeyStr.startsWith('111111111111')) {
        console.log(`Offset ${offset}:`, pubkeyStr);
      }
    } catch (e) {
      // Invalid pubkey, skip
    }
  }

  console.log('\n=== SUGGESTED FEE CALCULATION ===\n');
  console.log('Account has:', (accountBalance / 1e9).toFixed(6), 'SOL total');
  console.log('');
  console.log('If this is a Pump.fun bonding curve with accumulated fees,');
  console.log('the claimable amount is likely close to the account balance');
  console.log('minus the minimum rent-exempt amount (~0.002 SOL).');
  console.log('');
  
  const estimatedFees = Math.max(0, (accountBalance / 1e9) - 0.002);
  console.log('Estimated claimable fees:', estimatedFees.toFixed(6), 'SOL');
  
  if (estimatedFees >= parseFloat(process.env.CLAIM_THRESHOLD_SOL || '0.007')) {
    console.log('✅ This SHOULD trigger a claim!');
  } else {
    console.log('⏳ Still below threshold');
  }
}

analyzeCurve().catch(console.error);