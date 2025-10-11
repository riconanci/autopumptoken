import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Debug: Check which env vars exist
  const debug = {
    hasDATABASE_URL: !!process.env.DATABASE_URL,
    hasPOSTGRES_URL: !!process.env.POSTGRES_URL,
    hasPOSTGRES_PRISMA_URL: !!process.env.POSTGRES_PRISMA_URL
  };
  
  console.log('Environment check:', debug);

  try {
    // Get system stats
    const statsResult = await sql`
      SELECT * FROM system_status WHERE id = 1
    `;
    
    // Get recent burns (last 50)
    const burnsResult = await sql`
      SELECT * FROM burns 
      ORDER BY timestamp DESC 
      LIMIT 50
    `;

    // Get chart data (last 30 days)
    const chartResult = await sql`
      SELECT 
        DATE(timestamp) as date,
        SUM(amount) OVER (ORDER BY DATE(timestamp)) as cumulative_burned
      FROM burns
      WHERE timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(timestamp), amount, timestamp
      ORDER BY DATE(timestamp)
    `;

    const stats = statsResult.rows[0] || {
      total_burns: 0,
      total_tokens_burned: 0,
      total_sol_spent: 0
    };

    res.status(200).json({
      success: true,
      debug, // Include debug info
      data: {
        stats: {
          totalTokensBurned: stats.total_tokens_burned || '0',
          totalBuybackSpent: parseFloat(stats.total_sol_spent || 0),
          totalBurns: stats.total_burns || 0,
          totalClaims: 0
        },
        recentTransactions: burnsResult.rows.map(burn => ({
          type: 'burn',
          signature: burn.signature,
          amount: parseFloat(burn.amount),
          sol_spent: parseFloat(burn.sol_spent || 0),
          timestamp: burn.timestamp,
          status: burn.status || 'confirmed'
        })),
        burnChartData: chartResult.rows.map(row => ({
          timestamp: row.date,
          cumulativeBurned: parseFloat(row.cumulative_burned || 0)
        }))
      }
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      debug, // Include debug info even on error
      hint: 'Database may not be initialized. Visit /api/admin/init-db first'
    });
  }
}