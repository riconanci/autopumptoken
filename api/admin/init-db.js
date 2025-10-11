import { Pool } from '@vercel/postgres';

export default async function handler(req, res) {
  // Protect this endpoint
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const pool = new Pool();
  
  try {
    // Run your database schema here
    await pool.query(`
      CREATE TABLE IF NOT EXISTS burns (
        id SERIAL PRIMARY KEY,
        signature TEXT UNIQUE NOT NULL,
        amount NUMERIC NOT NULL,
        sol_spent NUMERIC,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        status TEXT DEFAULT 'confirmed'
      );
      
      CREATE TABLE IF NOT EXISTS system_status (
        id INTEGER PRIMARY KEY DEFAULT 1,
        total_burns INTEGER DEFAULT 0,
        total_tokens_burned NUMERIC DEFAULT 0,
        total_sol_spent NUMERIC DEFAULT 0,
        last_check TIMESTAMPTZ,
        last_claim TIMESTAMPTZ
      );
      
      INSERT INTO system_status (id) VALUES (1) ON CONFLICT DO NOTHING;
    `);
    
    res.status(200).json({ success: true, message: 'Database initialized' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}