/**
 * Complete database reset - clears records AND resets sequences
 * Run: node reset-database-complete.js
 */

require('dotenv').config();
const { Pool } = require('pg');

async function resetDatabase() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          COMPLETE DATABASE RESET                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 1: Delete All Records');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Delete in correct order (foreign keys)
    console.log('  Deleting burns...');
    await pool.query('DELETE FROM burns');
    console.log('  ✅ Done\n');

    console.log('  Deleting buybacks...');
    await pool.query('DELETE FROM buybacks');
    console.log('  ✅ Done\n');

    console.log('  Deleting claims...');
    await pool.query('DELETE FROM claims');
    console.log('  ✅ Done\n');

    console.log('  Deleting monitor checks...');
    await pool.query('DELETE FROM monitor_checks');
    console.log('  ✅ Done\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 2: Reset Auto-Increment Sequences');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('  Resetting claims sequence...');
    await pool.query("SELECT setval('claims_id_seq', 1, false)");
    console.log('  ✅ Reset to 1\n');

    console.log('  Resetting buybacks sequence...');
    await pool.query("SELECT setval('buybacks_id_seq', 1, false)");
    console.log('  ✅ Reset to 1\n');

    console.log('  Resetting burns sequence...');
    await pool.query("SELECT setval('burns_id_seq', 1, false)");
    console.log('  ✅ Reset to 1\n');

    console.log('  Resetting monitor_checks sequence...');
    await pool.query("SELECT setval('monitor_checks_id_seq', 1, false)");
    console.log('  ✅ Reset to 1\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 3: Reset System Status');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('  Resetting counters...');
    await pool.query(`
      UPDATE system_status SET
        is_paused = false,
        total_checks = 0,
        total_claims = 0,
        error_count = 0,
        last_error = NULL,
        last_error_timestamp = NULL,
        last_check_timestamp = NULL,
        updated_at = NOW()
      WHERE id = 1
    `);
    console.log('  ✅ Done\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 4: Verify Clean State');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const verify = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM claims) as claims_count,
        (SELECT COUNT(*) FROM buybacks) as buybacks_count,
        (SELECT COUNT(*) FROM burns) as burns_count,
        (SELECT COUNT(*) FROM monitor_checks) as monitor_checks_count
    `);

    const counts = verify.rows[0];
    console.log('  Claims:         ', counts.claims_count);
    console.log('  Buybacks:       ', counts.buybacks_count);
    console.log('  Burns:          ', counts.burns_count);
    console.log('  Monitor Checks: ', counts.monitor_checks_count);
    console.log('');

    if (counts.claims_count === '0' && counts.buybacks_count === '0' && 
        counts.burns_count === '0' && counts.monitor_checks_count === '0') {
      console.log('  ✅ All tables are empty!\n');
    } else {
      console.log('  ⚠️  Warning: Some records still exist\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ COMPLETE - DATABASE FULLY RESET');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('Your database is now in a clean state:');
    console.log('  • All records deleted');
    console.log('  • All ID sequences reset to 1');
    console.log('  • System status reset');
    console.log('  • Ready for production! 🚀\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

resetDatabase();