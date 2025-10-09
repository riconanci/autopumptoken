require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkDB() {
  try {
    const result = await pool.query(`
      SELECT id, tokens_burned, 
      to_timestamp(timestamp/1000) AT TIME ZONE 'America/Los_Angeles' as burn_time 
      FROM burns 
      ORDER BY id DESC 
      LIMIT 5
    `);
    
    console.log('Burns in database:', result.rows);
    console.log('\nTotal burns:', result.rows.length);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
  }
}

checkDB();