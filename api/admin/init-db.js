import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  try {
    console.log('Creating burns table...');
    await sql`
      CREATE TABLE IF NOT EXISTS burns (
        id SERIAL PRIMARY KEY,
        signature TEXT UNIQUE NOT NULL,
        amount NUMERIC NOT NULL,
        sol_spent NUMERIC DEFAULT 0,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        status TEXT DEFAULT 'confirmed'
      );
    `;

    console.log('Creating system_status table...');
    await sql`
      CREATE TABLE IF NOT EXISTS system_status (
        id INTEGER PRIMARY KEY DEFAULT 1,
        total_burns INTEGER DEFAULT 0,
        total_tokens_burned NUMERIC DEFAULT 0,
        total_sol_spent NUMERIC DEFAULT 0,
        last_check TIMESTAMPTZ,
        last_claim TIMESTAMPTZ,
        CONSTRAINT single_row CHECK (id = 1)
      );
    `;

    console.log('Inserting initial system status...');
    await sql`
      INSERT INTO system_status (id, total_burns, total_tokens_burned, total_sol_spent)
      VALUES (1, 0, 0, 0)
      ON CONFLICT (id) DO NOTHING;
    `;

    res.status(200).json({ 
      success: true, 
      message: 'Database initialized successfully!',
      tables: ['burns', 'system_status']
    });
  } catch (error) {
    console.error('Database init error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message
    });
  }
}