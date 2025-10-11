// api/cron/monitor-and-claim.js
import { claimOrchestrator } from '../../backend/src/services/claimOrchestrator';
import { log } from '../../backend/src/lib/logger';

export default async function handler(req, res) {
  // Verify request is from Vercel Cron
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    log.info('[CRON] Starting automated claim check...');
    await claimOrchestrator.executeClaimFlow();
    
    res.status(200).json({ 
      success: true, 
      message: 'Claim check completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('[CRON] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}