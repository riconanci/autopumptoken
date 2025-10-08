/**
 * Check all possible accounts where fees might be stored
 * Run: node check-all-fee-accounts.js
 */

require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

const MINT = process.env.TOKEN_MINT;
const CREATOR = process.env.CREATOR_WALLET_SECRET;
const RPC = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function checkAllAccounts() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('CHECKING ALL ACCOUNTS FOR FEES');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const connection = new Connection(RPC, 'confirmed');
  const mintPubkey = new PublicKey(MINT);
  
  // Get creator public key from secret (handle both base58 and JSON array formats)
  const bs58 = require('bs58');
  let creatorKeypair;
  try {
    // Try base58 format first
    const decoded = bs58.decode(CREATOR);
    creatorKeypair = require('@solana/web3.js').Keypair.fromSecretKey(decoded);
  } catch (e) {
    // Try JSON array format
    const secretKey = Uint8Array.from(JSON.parse(CREATOR));
    creatorKeypair = require('@solana/web3.js').Keypair.fromSecretKey(secretKey);
  }
  const creatorPubkey = creatorKeypair.publicKey;
  
  console.log('Token Mint:', MINT);
  console.log('Creator Wallet:', creatorPubkey.toString(), '\n');
  
  // 1. Check bonding curve
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1. BONDING CURVE ACCOUNT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const [bondingCurve] = await PublicKey.findProgramAddress(
    [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
    PUMP_PROGRAM_ID
  );
  
  console.log('Address:', bondingCurve.toString());
  
  const bcInfo = await connection.getAccountInfo(bondingCurve);
  if (bcInfo) {
    const balance = bcInfo.lamports / 1e9;
    const data = bcInfo.data;
    const offset32 = Number(data.readBigUInt64LE(32)) / 1e9;
    const calculated = Math.max(0, balance - offset32);
    
    console.log('Balance:', balance.toFixed(9), 'SOL');
    console.log('Offset 32:', offset32.toFixed(9), 'SOL');
    console.log('Calculated fees (balance - offset32):', calculated.toFixed(9), 'SOL');
  } else {
    console.log('❌ Not found');
  }
  
  // 2. Check for associated bonding curve token account
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('2. BONDING CURVE TOKEN ACCOUNT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    const { getAssociatedTokenAddress } = require('@solana/spl-token');
    const bcAta = await getAssociatedTokenAddress(
      mintPubkey,
      bondingCurve,
      true
    );
    
    console.log('Address:', bcAta.toString());
    const ataInfo = await connection.getAccountInfo(bcAta);
    if (ataInfo) {
      console.log('✅ Exists');
      console.log('Balance:', ataInfo.lamports / 1e9, 'SOL');
    } else {
      console.log('❌ Not found');
    }
  } catch (e) {
    console.log('❌ Error:', e.message);
  }
  
  // 3. Check creator wallet balance
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('3. CREATOR WALLET');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const creatorBalance = await connection.getBalance(creatorPubkey);
  console.log('Address:', creatorPubkey.toString());
  console.log('SOL Balance:', (creatorBalance / 1e9).toFixed(9), 'SOL');
  
  // 4. Check for PDA based on creator + mint
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('4. CREATOR FEES PDA (creator + mint)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    const [feesPda] = await PublicKey.findProgramAddress(
      [Buffer.from('creator-fees'), creatorPubkey.toBuffer(), mintPubkey.toBuffer()],
      PUMP_PROGRAM_ID
    );
    
    console.log('Address:', feesPda.toString());
    const feesInfo = await connection.getAccountInfo(feesPda);
    if (feesInfo) {
      console.log('✅ Exists!');
      console.log('Balance:', (feesInfo.lamports / 1e9).toFixed(9), 'SOL');
      console.log('Data length:', feesInfo.data.length, 'bytes');
      
      // Try to read fees from this account
      if (feesInfo.data.length >= 8) {
        const fees = Number(feesInfo.data.readBigUInt64LE(0)) / 1e9;
        console.log('Fees at offset 0:', fees.toFixed(9), 'SOL');
      }
    } else {
      console.log('❌ Not found');
    }
  } catch (e) {
    console.log('❌ Error:', e.message);
  }
  
  // 5. Check for global config PDA
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('5. GLOBAL CONFIG ACCOUNT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    const [globalConfig] = await PublicKey.findProgramAddress(
      [Buffer.from('global')],
      PUMP_PROGRAM_ID
    );
    
    console.log('Address:', globalConfig.toString());
    const configInfo = await connection.getAccountInfo(globalConfig);
    if (configInfo) {
      console.log('✅ Exists');
      console.log('Data length:', configInfo.data.length, 'bytes');
    } else {
      console.log('❌ Not found');
    }
  } catch (e) {
    console.log('❌ Error:', e.message);
  }
  
  // 6. Get all accounts owned by Pump program related to this mint
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('6. ALL PUMP PROGRAM ACCOUNTS FOR THIS MINT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    const accounts = await connection.getProgramAccounts(PUMP_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: mintPubkey.toBase58(),
          },
        },
      ],
    });
    
    console.log(`Found ${accounts.length} account(s):\n`);
    
    for (const account of accounts) {
      console.log('Address:', account.pubkey.toString());
      console.log('Balance:', (account.account.lamports / 1e9).toFixed(9), 'SOL');
      console.log('Data length:', account.account.data.length, 'bytes');
      
      if (account.account.data.length >= 32) {
        const offset32 = Number(account.account.data.readBigUInt64LE(32)) / 1e9;
        console.log('Offset 32:', offset32.toFixed(9), 'SOL');
      }
      console.log('');
    }
  } catch (e) {
    console.log('❌ Error:', e.message);
  }
  
  // 7. Try actual claim to see what happens
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('7. RECOMMENDATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('Based on bonding curve data:');
  const bcCalc = Math.max(0, (bcInfo.lamports / 1e9) - (Number(bcInfo.data.readBigUInt64LE(32)) / 1e9));
  console.log('  Calculated claimable: ~', bcCalc.toFixed(6), 'SOL');
  console.log('  Your threshold:', process.env.CLAIM_THRESHOLD_SOL || '0.01', 'SOL\n');
  
  if (bcCalc < 0.005) {
    console.log('💡 The dashboard might be showing stale/cached data.');
    console.log('💡 Try setting CLAIM_THRESHOLD_SOL=0.001 to test with current actual fees.');
    console.log('💡 This will trigger a claim and you can verify the actual amount received.\n');
  }
  
  console.log('═══════════════════════════════════════════════════════════\n');
}

checkAllAccounts().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err);
});