import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  try {
    // Check which database we're connected to
    const dbInfo = await sql`
      SELECT current_database(), current_schema()
    `;
    
    // List all tables in public schema
    const tables = await sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;
    
    // Check if system_status exists
    const systemStatusExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'system_status'
      )
    `;
    
    res.status(200).json({
      success: true,
      database: dbInfo.rows[0],
      tablesFound: tables.rows.map(t => t.tablename),
      systemStatusExists: systemStatusExists.rows[0].exists,
      connectionInfo: {
        hasDATABASE_URL: !!process.env.DATABASE_URL,
        hasPOSTGRES_URL: !!process.env.POSTGRES_URL
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}