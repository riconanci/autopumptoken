/**
 * Test what actually happens when we try to claim fees
 * This will show us if there are any real claimable fees
 * 
 * Run: node test-actual-claim.js
 */

require('dotenv').config();
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');

async function testClaim() {
  console.log('\n================================================');
  console.log('TESTING ACTUAL CLAIM (DRY RUN - NO TRANSACTION)');
  console.log('================================================\n');

  const MINT = process.env.TOKEN_MINT;
  const RPC = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
  const CREATOR_SECRET = process.env.CREATOR_WALLET_SECRET;

  const connection = new Connection(RPC);
  const creatorKeypair = Keypair.fromSecretKey(bs58.decode(CREATOR_SECRET));

  console.log('Creator Wallet:', creatorKeypair.publicKey.toBase58());
  
  // Check balance before
  const balanceBefore = await connection.getBalance(creatorKeypair.publicKey);
  console.log('Wallet Balance:', (balanceBefore / 1e9).toFixed(9), 'SOL\n');

  console.log('Calling PumpPortal API to get claim transaction...\n');

  try {
    const response = await fetch('https://pumpportal.fun/api/trade-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: creatorKeypair.publicKey.toBase58(),
        action: 'collectCreatorFee',
        priorityFee: 0.000001,
      })
    });

    console.log('Response Status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ API Error:', errorText);
      
      if (errorText.includes('no fees') || errorText.includes('nothing to claim')) {
        console.log('\n✅ CONFIRMED: There are NO claimable fees!');
        console.log('   Offset 32 (0.08 SOL) is NOT creator fees.');
        console.log('   It\'s likely the bonding curve\'s SOL liquidity.');
        console.log('\n   Solution: Don\'t claim until REAL fees accumulate.');
      }
      return;
    }

    const transactionBytes = await response.arrayBuffer();
    console.log('✅ Got transaction from API');
    console.log('   Transaction size:', transactionBytes.byteLength, 'bytes');
    console.log('\n⚠️  Transaction is unsigned - not sending it');
    console.log('   (This was just a test to see if fees are claimable)');
    
    console.log('\n❓ API says fees ARE claimable');
    console.log('   Offset 32 might actually be correct for your token.');
    console.log('   Or there might be a small amount of real fees.');

  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  console.log('\n================================================\n');
}

testClaim().catch(console.error);