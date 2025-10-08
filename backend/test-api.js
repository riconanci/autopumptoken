/**
 * Test different PumpPortal API endpoints
 * Run: node test-api.js
 */

const axios = require('axios');

const MINT = '9AV236iTUAhkJz2vwjKW8rCTsgH7TDNU9CiY67M4pump';

const endpoints = [
  'https://pumpportal.fun/coins/' + MINT,
  'https://pumpportal.fun/api/coins/' + MINT,
  'https://pumpportal.fun/token/' + MINT,
  'https://pumpportal.fun/api/token/' + MINT,
  'https://frontend-api.pump.fun/coins/' + MINT,
  'https://client-api-2-74b1891ee9f9.herokuapp.com/coins/' + MINT,
];

async function testEndpoint(url) {
  try {
    console.log(`\nTesting: ${url}`);
    const response = await axios.get(url, { timeout: 5000 });
    console.log('✅ SUCCESS!');
    console.log('Status:', response.status);
    console.log('Data keys:', Object.keys(response.data));
    console.log('Sample data:', JSON.stringify(response.data).substring(0, 200));
    return true;
  } catch (error) {
    if (error.response) {
      console.log(`❌ FAILED: ${error.response.status} ${error.response.statusText}`);
    } else {
      console.log(`❌ FAILED: ${error.message}`);
    }
    return false;
  }
}

async function testAll() {
  console.log('Testing PumpPortal API endpoints...');
  console.log('Token:', MINT);
  console.log('='.repeat(60));

  for (const endpoint of endpoints) {
    const success = await testEndpoint(endpoint);
    if (success) {
      console.log('\n' + '='.repeat(60));
      console.log('✅ WORKING ENDPOINT FOUND!');
      console.log('Use this in your .env:');
      console.log('PUMP_API_BASE=' + endpoint.replace('/coins/' + MINT, ''));
      console.log('='.repeat(60));
      break;
    }
  }
}

testAll();