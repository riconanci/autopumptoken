/**
 * Direct startup test - bypasses tsx and typescript
 * Save as: backend/test-startup.js
 * Run: node test-startup.js
 */

console.log('Starting basic Node.js test...');

// Test 1: Can we load dotenv?
console.log('\n1. Testing dotenv...');
try {
  require('dotenv').config();
  console.log('✅ dotenv loaded');
} catch (error) {
  console.error('❌ dotenv failed:', error.message);
  process.exit(1);
}

// Test 2: Can we load express?
console.log('\n2. Testing express...');
try {
  const express = require('express');
  const app = express();
  console.log('✅ express loaded');
} catch (error) {
  console.error('❌ express failed:', error.message);
  process.exit(1);
}

// Test 3: Can we load @solana/web3.js?
console.log('\n3. Testing @solana/web3.js...');
try {
  const { Connection, PublicKey } = require('@solana/web3.js');
  const connection = new Connection(process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com');
  console.log('✅ Solana web3 loaded');
} catch (error) {
  console.error('❌ Solana web3 failed:', error.message);
  process.exit(1);
}

// Test 4: Can we load winston (logger)?
console.log('\n4. Testing winston logger...');
try {
  const winston = require('winston');
  const testLogger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    transports: [new winston.transports.Console()]
  });
  testLogger.info('Test log message');
  console.log('✅ winston logger loaded');
} catch (error) {
  console.error('❌ winston failed:', error.message);
  process.exit(1);
}

// Test 5: Can we create logs directory?
console.log('\n5. Testing logs directory...');
try {
  const fs = require('fs');
  const path = require('path');
  const logsDir = path.join(__dirname, 'logs');
  
  if (!fs.existsSync(logsDir)) {
    console.log('   Creating logs directory...');
    fs.mkdirSync(logsDir, { recursive: true });
  }
  console.log('✅ logs directory ready');
} catch (error) {
  console.error('❌ logs directory failed:', error.message);
  process.exit(1);
}

// Test 6: Try to compile and run the actual index.ts
console.log('\n6. Attempting to load src/index.ts...');
try {
  require('tsx/cjs');
  console.log('✅ tsx/cjs runtime loaded');
  
  // Now try loading the actual file
  console.log('\n7. Loading your actual src/index.ts...');
  console.log('   If this hangs or exits, there\'s an issue in your code.\n');
  
  require('./src/index.ts');
  
} catch (error) {
  console.error('\n❌ STARTUP FAILED:', error.message);
  console.error('\nFull error:');
  console.error(error);
  process.exit(1);
}