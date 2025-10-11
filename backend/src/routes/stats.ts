import { Router, Request, Response } from 'express';
import { getSystemStats, getTransactionHistory } from '../db/queries';
import { getCurrentClaimableFees } from '../services/feeMonitor';
import { getSchedulerStatus } from '../scheduler';
import { publicStatsEnabled, checkIntervalMinutes } from '../env';
import { log } from '../lib/logger';
import { ApiResponse, DashboardData } from '../types';

const router = Router();

// Add CORS to all stats routes
router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

/**
 * GET /api/stats - Get system statistics
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    if (!publicStatsEnabled) {
      return res.status(403).json({
        success: false,
        error: 'Public stats are disabled',
        timestamp: Date.now(),
      });
    }

    const stats = await getSystemStats();
    const schedulerStatus = getSchedulerStatus();
    
    // Get current claimable fees
    const currentClaimableFees = await getCurrentClaimableFees();
    stats.currentClaimableFees = currentClaimableFees;
    stats.nextCheckTimestamp = schedulerStatus.nextCheckTime || 0;

    const response: ApiResponse = {
      success: true,
      data: stats,
      timestamp: Date.now(),
    };

    log.api('GET', '/api/stats', 200);
    res.json(response);
  } catch (error) {
    log.error('Stats API error', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/stats/dashboard - Get complete dashboard data
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    if (!publicStatsEnabled) {
      return res.status(403).json({
        success: false,
        error: 'Public stats are disabled',
        timestamp: Date.now(),
      });
    }

    const stats = await getSystemStats();
    const schedulerStatus = getSchedulerStatus();
    const transactions = await getTransactionHistory(50);
    
    // Get current claimable fees
    const currentClaimableFees = await getCurrentClaimableFees();
    stats.currentClaimableFees = currentClaimableFees;
    stats.nextCheckTimestamp = schedulerStatus.nextCheckTime || 0;

    // Generate chart data (simplified - can be enhanced)
    const burnChartData = transactions
      .filter(tx => tx.type === 'burn' && tx.status === 'confirmed')
      .reverse()
      .map((tx, index, arr) => ({
        timestamp: tx.timestamp,
        cumulativeBurned: arr
          .slice(0, index + 1)
          .reduce((sum, t) => sum + Number(t.amount), 0),
      }));

    const treasuryChartData = transactions
      .filter(tx => tx.type === 'claim' && tx.status === 'confirmed')
      .reverse()
      .map((tx, index, arr) => ({
        timestamp: tx.timestamp,
        cumulativeTransferred: arr
          .slice(0, index + 1)
          .reduce((sum, t) => sum + Number(t.amount) * 0.5, 0), // 50% goes to treasury
      }));

    const dashboardData: DashboardData = {
      stats,
      recentTransactions: transactions,
      burnChartData,
      treasuryChartData,
    };

    const response: ApiResponse = {
      success: true,
      data: dashboardData,
      timestamp: Date.now(),
    };

    log.api('GET', '/api/stats/dashboard', 200);
    res.json(response);
  } catch (error) {
    log.error('Dashboard API error', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/stats/history - Get transaction history
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    if (!publicStatsEnabled) {
      return res.status(403).json({
        success: false,
        error: 'Public stats are disabled',
        timestamp: Date.now(),
      });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const transactions = await getTransactionHistory(limit);

    const response: ApiResponse = {
      success: true,
      data: transactions,
      timestamp: Date.now(),
    };

    log.api('GET', '/api/stats/history', 200, { limit });
    res.json(response);
  } catch (error) {
    log.error('History API error', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/stats/scheduler - Get scheduler status
 */
router.get('/scheduler', async (req: Request, res: Response) => {
  try {
    if (!publicStatsEnabled) {
      return res.status(403).json({
        success: false,
        error: 'Public stats are disabled',
        timestamp: Date.now(),
      });
    }

    const schedulerStatus = getSchedulerStatus();
    
    const response: ApiResponse = {
      success: true,
      data: {
        ...schedulerStatus,
        checkIntervalMinutes,
        nextCheckIn: schedulerStatus.nextCheckTime 
          ? Math.max(0, Math.floor((schedulerStatus.nextCheckTime - Date.now()) / 1000))
          : null,
      },
      timestamp: Date.now(),
    };

    log.api('GET', '/api/stats/scheduler', 200);
    res.json(response);
  } catch (error) {
    log.error('Scheduler status API error', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    });
  }
});

export default router;