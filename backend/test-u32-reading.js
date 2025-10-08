/**
 * Test reading as u32 instead of u64
 * Run: node test-u32-reading.js
 */

require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

const MINT = process.env.TOKEN_MINT || '9AV236iTUAhkJz2vwjKW8rCTsgH7TDNU9CiY67M4pump';
const RPC = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function testU32() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TESTING U32 (32-BIT) READS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const connection = new Connection(RPC, 'confirmed');
  const mintPubkey = new PublicKey(MINT);
  
  const [bondingCurve] = await PublicKey.findProgramAddress(
    [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
    PUMP_PROGRAM_ID
  );
  
  const accountInfo = await connection.getAccountInfo(bondingCurve);
  const data = accountInfo.data;
  const accountBalanceSOL = accountInfo.lamports / 1e9;
  
  console.log('Account Balance:', accountBalanceSOL.toFixed(9), 'SOL');
  console.log('Expected claimable: ~0.01935 SOL');
  console.log('Expected reserves: ~0.00872 SOL (8,724,008 lamports)\n');
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('U32 VALUES AT EACH 4-BYTE OFFSET');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  for (let offset = 0; offset <= data.length - 4; offset += 4) {
    const value = data.readUInt32LE(offset);
    const asSol = value / 1e9;
    const claimable = accountBalanceSOL - asSol;
    
    // Highlight if claimable is close to 0.01935
    const isMatch = Math.abs(claimable - 0.01935) < 0.001;
    const marker = isMatch ? ' 🎯 MATCH!' : '';
    
    console.log(`Offset ${String(offset).padStart(3)}:`,
                String(value).padStart(12), 'lamports →',
                String(asSol.toFixed(9)).padStart(15), 'SOL →',
                'claimable:', String(claimable.toFixed(9)).padStart(15), 'SOL',
                marker);
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('CHECKING OFFSET 16 AS U64 VS TWO U32s');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const offset16_u64 = data.readBigUInt64LE(16);
  console.log('Offset 16 as u64:', offset16_u64.toString(), 'lamports');
  console.log('                  ', (Number(offset16_u64) / 1e9).toFixed(9), 'SOL\n');
  
  const offset16_u32_low = data.readUInt32LE(16);
  const offset16_u32_high = data.readUInt32LE(20);
  console.log('Offset 16 as u32 (low word): ', offset16_u32_low, 'lamports');
  console.log('                              ', (offset16_u32_low / 1e9).toFixed(9), 'SOL');
  console.log('                               claimable:', (accountBalanceSOL - offset16_u32_low / 1e9).toFixed(9), 'SOL\n');
  
  console.log('Offset 20 as u32 (high word):', offset16_u32_high, 'lamports');
  console.log('                              ', (offset16_u32_high / 1e9).toFixed(9), 'SOL\n');
  
  console.log('═══════════════════════════════════════════════════════════');
}

testU32().catch(console.error);