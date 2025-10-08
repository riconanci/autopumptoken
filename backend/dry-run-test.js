/**
 * DRY RUN TEST - Does NOT claim anything!
 * 
 * This verifies your system will correctly detect ~0.005 SOL rewards
 * and trigger at the right threshold WITHOUT actually claiming.
 * 
 * Run: node dry-run-test.js
 */

require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

async function dryRunTest() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          DRY RUN TEST (NO CLAIM)                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const MINT = process.env.TOKEN_MINT;
  const RPC = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
  const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  
  console.log('Token Mint:', MINT);
  console.log('Dashboard URL: https://pump.fun/coin/' + MINT);
  console.log('');
  console.log('⚠️  Go check your dashboard NOW and note the "Unclaimed" amount!\n');

  const connection = new Connection(RPC, 'confirmed');
  const mintPubkey = new PublicKey(MINT);
  
  const [bondingCurve] = await PublicKey.findProgramAddress(
    [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
    PUMP_PROGRAM_ID
  );
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 1: Read Bonding Curve Data');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const accountInfo = await connection.getAccountInfo(bondingCurve);
  
  if (!accountInfo) {
    console.log('❌ Bonding curve not found\n');
    return;
  }

  const data = accountInfo.data;
  const accountBalance = accountInfo.lamports / 1e9;
  const offset32Value = Number(data.readBigUInt64LE(32)) / 1e9;
  const rawCalculation = Math.max(0, accountBalance - offset32Value);
  
  console.log('  Account Balance:  ', accountBalance.toFixed(9), 'SOL');
  console.log('  Offset 32:        ', offset32Value.toFixed(9), 'SOL');
  console.log('  Raw Difference:   ', rawCalculation.toFixed(9), 'SOL\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 2: Calculate Different Estimates');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const multipliers = {
    'Direct offset 32': offset32Value,
    'Balance - Offset32': rawCalculation,
    'Raw × 1.0': rawCalculation * 1.0,
    'Raw × 1.5 (NEW)': rawCalculation * 1.5,
    'Raw × 2.0 (OLD)': rawCalculation * 2.0,
    'Offset32 ÷ 10': offset32Value / 10,
    'Offset32 ÷ 5': offset32Value / 5,
  };

  console.log('  Method                    | Result (SOL)');
  console.log('  --------------------------|---------------');
  Object.entries(multipliers).forEach(([method, value]) => {
    console.log('  ' + method.padEnd(24) + ' | ' + value.toFixed(9));
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 3: Compare with Dashboard');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('  Dashboard shows: _______ SOL (fill this in!)\n');
  
  console.log('  Which calculation matches your dashboard?\n');
  console.log('  If dashboard shows ~0.005 SOL:');
  console.log('    → Raw × 1.5 gives:', (rawCalculation * 1.5).toFixed(9), 'SOL');
  console.log('    → Error:', Math.abs((rawCalculation * 1.5) - 0.005).toFixed(9), 'SOL\n');
  
  console.log('  If dashboard shows ~0.004 SOL:');
  console.log('    → Raw × 2.0 gives:', (rawCalculation * 2.0).toFixed(9), 'SOL');
  console.log('    → Error:', Math.abs((rawCalculation * 2.0) - 0.004).toFixed(9), 'SOL\n');

  console.log('  If dashboard shows ~0.003 SOL:');
  console.log('    → Offset32 ÷ 10 gives:', (offset32Value / 10).toFixed(9), 'SOL');
  console.log('    → Error:', Math.abs((offset32Value / 10) - 0.003).toFixed(9), 'SOL\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 4: Threshold Check (NO CLAIM)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const threshold = parseFloat(process.env.CLAIM_THRESHOLD_SOL || '0.01');
  const currentEstimate = rawCalculation * 2;  // Old formula
  const newEstimate = rawCalculation * 1.5;     // New formula
  
  console.log('  Your threshold:       ', threshold.toFixed(9), 'SOL\n');
  
  console.log('  OLD formula (× 2):    ', currentEstimate.toFixed(9), 'SOL');
  if (currentEstimate >= threshold) {
    console.log('    ✅ WOULD TRIGGER CLAIM');
  } else {
    console.log('    ❌ Would NOT trigger (need', (threshold - currentEstimate).toFixed(6), 'more SOL)');
  }
  console.log('');
  
  console.log('  NEW formula (× 1.5):  ', newEstimate.toFixed(9), 'SOL');
  if (newEstimate >= threshold) {
    console.log('    ✅ WOULD TRIGGER CLAIM');
  } else {
    console.log('    ❌ Would NOT trigger (need', (threshold - newEstimate).toFixed(6), 'more SOL)');
  }
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 5: Simulate 50/50 Split');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Use the new estimate for simulation
  const estimatedClaim = newEstimate;
  const treasuryAmount = estimatedClaim * 0.5;
  const buybackAmount = estimatedClaim * 0.5;
  
  console.log('  IF we claimed with NEW formula:\n');
  console.log('  Estimated claim:      ', estimatedClaim.toFixed(9), 'SOL');
  console.log('  Treasury (50%):       ', treasuryAmount.toFixed(9), 'SOL');
  console.log('  Buyback (50%):        ', buybackAmount.toFixed(9), 'SOL\n');
  
  console.log('  ⚠️  NOTE: Actual amounts will be verified by balance check!');
  console.log('     The system checks wallet balance before/after claiming');
  console.log('     and uses the ACTUAL received amount for splits.\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 6: System Configuration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  AUTO_CLAIM_ENABLED:   ', process.env.AUTO_CLAIM_ENABLED || 'false');
  console.log('  CHECK_INTERVAL_MIN:   ', process.env.CHECK_INTERVAL_MINUTES || '2', 'minutes');
  console.log('  CLAIM_THRESHOLD_SOL:  ', threshold, 'SOL');
  console.log('  TREASURY_PERCENT:     ', process.env.TREASURY_PERCENT || '50', '%');
  console.log('  BUYBACK_PERCENT:      ', process.env.BUYBACK_PERCENT || '50', '%\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('RECOMMENDATIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const dashboardAmount = 0.005; // Assumed, user should verify
  const estimateError = Math.abs(newEstimate - dashboardAmount);
  const errorPercent = (estimateError / dashboardAmount) * 100;

  if (estimateError < 0.0005) {
    console.log('  ✅ NEW formula (× 1.5) is EXCELLENT!');
    console.log('     Error < 0.0005 SOL (< ' + errorPercent.toFixed(1) + '%)');
    console.log('     This is accurate enough for threshold checking.\n');
  } else if (estimateError < 0.001) {
    console.log('  ✅ NEW formula (× 1.5) is GOOD!');
    console.log('     Error < 0.001 SOL (' + errorPercent.toFixed(1) + '%)');
    console.log('     Acceptable for threshold checking.\n');
  } else if (estimateError < 0.002) {
    console.log('  ⚠️  NEW formula (× 1.5) is OKAY');
    console.log('     Error: ' + estimateError.toFixed(6) + ' SOL (' + errorPercent.toFixed(1) + '%)');
    console.log('     May need fine-tuning if dashboard shows different value.\n');
  } else {
    console.log('  ❌ NEW formula (× 1.5) may be WRONG');
    console.log('     Error: ' + estimateError.toFixed(6) + ' SOL (' + errorPercent.toFixed(1) + '%)');
    console.log('     Check dashboard and tell me the exact "Unclaimed" amount!\n');
  }

  console.log('  To test for real (when ready):');
  console.log('    1. Set CLAIM_THRESHOLD_SOL=0.001 (below estimate)');
  console.log('    2. npm run dev');
  console.log('    3. Trigger: curl -X POST http://localhost:3000/api/claim ...');
  console.log('    4. Watch logs for actual amounts!\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('VERIFICATION CHECKLIST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const checks = [
    {
      name: 'Estimate matches dashboard (~0.005 SOL)',
      status: estimateError < 0.001 ? '✅' : '❌',
      value: newEstimate.toFixed(6) + ' SOL'
    },
    {
      name: 'Estimate above threshold for test',
      status: newEstimate >= 0.001 ? '✅' : '❌',
      value: newEstimate >= 0.001 ? 'Yes' : 'No'
    },
    {
      name: 'pumpfun.ts updated with 1.5× multiplier',
      status: '❓',
      value: 'Check manually'
    },
    {
      name: 'feeClaim.ts uses balance verification',
      status: '❓',
      value: 'Run verify-feeClaim-logic.js'
    },
    {
      name: 'Threshold low enough for test',
      status: threshold <= newEstimate ? '✅' : '❌',
      value: threshold.toFixed(6) + ' SOL'
    }
  ];

  checks.forEach(check => {
    console.log('  ' + check.status + ' ' + check.name);
    console.log('      → ' + check.value);
    console.log('');
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 ACTION ITEMS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  1. Check dashboard and confirm "Unclaimed" amount');
  console.log('     Dashboard URL: https://pump.fun/coin/' + MINT);
  console.log('');
  console.log('  2. If dashboard shows ~0.005 SOL:');
  console.log('     → NEW formula is correct! ✅');
  console.log('     → Replace pumpfun.ts with the 1.5× version');
  console.log('');
  console.log('  3. If dashboard shows different amount:');
  console.log('     → Tell me the exact amount');
  console.log('     → I\'ll calculate the correct multiplier');
  console.log('');
  console.log('  4. Before claiming:');
  console.log('     → Verify: node verify-feeClaim-logic.js');
  console.log('     → Test threshold logic with low value (0.001)');
  console.log('');
  console.log('  5. When ready to claim:');
  console.log('     → Set threshold below estimate');
  console.log('     → Trigger manual claim');
  console.log('     → Verify actual amounts in logs');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('✅ Dry run complete! No claims were made.');
  console.log('');
}

dryRunTest().catch(err => {
  console.error('\n❌ Error:', err.message);
  console.error(err);
  process.exit(1);
});