/**
 * Debug wallet secret loading
 * Run: node debug-wallet.js
 */

require('dotenv').config();
const bs58 = require('bs58');

console.log('Checking wallet secrets from .env...\n');

const creatorSecret = process.env.CREATOR_WALLET_SECRET;
const treasurySecret = process.env.TREASURY_WALLET_SECRET;

console.log('CREATOR_WALLET_SECRET:');
console.log('  Type:', typeof creatorSecret);
console.log('  Length:', creatorSecret ? creatorSecret.length : 0);
console.log('  First 10 chars:', creatorSecret ? creatorSecret.substring(0, 10) : 'MISSING');
console.log('  Last 10 chars:', creatorSecret ? creatorSecret.substring(creatorSecret.length - 10) : 'MISSING');
console.log('  Has quotes?', creatorSecret ? (creatorSecret.includes('"') || creatorSecret.includes("'")) : 'N/A');
console.log('  Has spaces?', creatorSecret ? creatorSecret.includes(' ') : 'N/A');
console.log('  Has newlines?', creatorSecret ? (creatorSecret.includes('\n') || creatorSecret.includes('\r')) : 'N/A');
console.log('');

if (creatorSecret) {
  try {
    // Try trimming first
    const trimmed = creatorSecret.trim();
    console.log('After trimming:');
    console.log('  Length:', trimmed.length);
    console.log('');
    
    // Try to decode
    const decoded = bs58.decode(trimmed);
    console.log('✅ Successfully decoded!');
    console.log('  Decoded length:', decoded.length, 'bytes');
    
    if (decoded.length === 64) {
      console.log('  ✅ Correct length (64 bytes)');
    } else {
      console.log('  ⚠️  Wrong length (expected 64 bytes)');
    }
  } catch (error) {
    console.log('❌ Failed to decode:', error.message);
    console.log('');
    console.log('Checking for common issues:');
    
    // Check if it's wrapped in quotes
    if (creatorSecret.startsWith('"') || creatorSecret.startsWith("'")) {
      console.log('  ⚠️  Starts with quotes - remove them!');
    }
    if (creatorSecret.endsWith('"') || creatorSecret.endsWith("'")) {
      console.log('  ⚠️  Ends with quotes - remove them!');
    }
    
    // Check for invalid base58 characters
    const validBase58 = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
    if (!validBase58.test(creatorSecret.trim())) {
      console.log('  ⚠️  Contains invalid base58 characters');
      console.log('     Valid chars: 1-9, A-Z (except I,O), a-z (except l)');
    }
  }
}

console.log('\n' + '='.repeat(60));
console.log('TREASURY_WALLET_SECRET:');
console.log('  Type:', typeof treasurySecret);
console.log('  Length:', treasurySecret ? treasurySecret.length : 0);

if (treasurySecret) {
  try {
    const decoded = bs58.decode(treasurySecret.trim());
    console.log('  ✅ Successfully decoded! (' + decoded.length + ' bytes)');
  } catch (error) {
    console.log('  ❌ Failed to decode:', error.message);
  }
}