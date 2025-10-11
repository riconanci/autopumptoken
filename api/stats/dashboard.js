import db from '../../backend/src/db/queries';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stats = await db.getSystemStats();
    const recentBurns = await db.getRecentBurns(50);
    const chartData = await db.getBurnChartData('30d');

    res.status(200).json({
      success: true,
      data: {
        stats,
        recentTransactions: recentBurns,
        burnChartData: chartData
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}