/**
 * Clear database records - Interactive version (works on Windows)
 * Run: node clear-database-interactive.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function clearRecords() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          CLEAR DATABASE RECORDS                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Connected to database\n');

    // Get current counts
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('CURRENT RECORD COUNTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const counts = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM claims) as claims_count,
        (SELECT COUNT(*) FROM buybacks) as buybacks_count,
        (SELECT COUNT(*) FROM burns) as burns_count,
        (SELECT COUNT(*) FROM monitor_checks) as monitor_checks_count
    `);

    const { claims_count, buybacks_count, burns_count, monitor_checks_count } = counts.rows[0];

    console.log('  Claims:         ', claims_count);
    console.log('  Buybacks:       ', buybacks_count);
    console.log('  Burns:          ', burns_count);
    console.log('  Monitor Checks: ', monitor_checks_count);
    console.log('');

    if (claims_count === '0' && buybacks_count === '0' && burns_count === '0' && monitor_checks_count === '0') {
      console.log('✅ No records to clear! Database is already clean.\n');
      rl.close();
      await pool.end();
      return;
    }

    // Confirm deletion
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  WARNING');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('This will DELETE all records from:');
    console.log('  • claims');
    console.log('  • buybacks');
    console.log('  • burns');
    console.log('  • monitor_checks');
    console.log('');
    console.log('This action CANNOT be undone!\n');

    const answer = await askQuestion('Are you sure you want to delete ALL records? (yes/no): ');

    if (answer.toLowerCase() !== 'yes') {
      console.log('\n❌ Deletion cancelled. Exiting safely.\n');
      rl.close();
      await pool.end();
      return;
    }

    console.log('\n✅ Deletion confirmed. Proceeding...\n');

    // Delete records (in correct order due to foreign keys)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('DELETING RECORDS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 1. Delete burns (has FK to buybacks)
    console.log('  Deleting burns...');
    const burnsResult = await pool.query('DELETE FROM burns');
    console.log('  ✅ Deleted', burnsResult.rowCount, 'burn records\n');

    // 2. Delete buybacks (has FK to claims)
    console.log('  Deleting buybacks...');
    const buybacksResult = await pool.query('DELETE FROM buybacks');
    console.log('  ✅ Deleted', buybacksResult.rowCount, 'buyback records\n');

    // 3. Delete claims
    console.log('  Deleting claims...');
    const claimsResult = await pool.query('DELETE FROM claims');
    console.log('  ✅ Deleted', claimsResult.rowCount, 'claim records\n');

    // 4. Delete monitor checks
    console.log('  Deleting monitor checks...');
    const monitorsResult = await pool.query('DELETE FROM monitor_checks');
    console.log('  ✅ Deleted', monitorsResult.rowCount, 'monitor check records\n');

    // 5. Reset system status counters
    console.log('  Resetting system status counters...');
    await pool.query(`
      UPDATE system_status SET
        total_checks = 0,
        total_claims = 0,
        error_count = 0,
        last_error = NULL,
        last_error_timestamp = NULL,
        updated_at = NOW()
      WHERE id = 1
    `);
    console.log('  ✅ System status counters reset\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ SUCCESS - DATABASE CLEANED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('All test records have been deleted.');
    console.log('Your database is now clean and ready for production! 🚀\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  } finally {
    rl.close();
    await pool.end();
  }
}

clearRecords();