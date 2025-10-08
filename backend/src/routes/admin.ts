import { Router, Request, Response } from 'express';
import { 
  pauseMonitoring, 
  resumeMonitoring, 
  getSchedulerStatus,
  forceCheck 
} from '../scheduler';
import { getSystemStatus } from '../db/queries';
import { checkConnection } from '../lib/solana';
import { adminApiKey } from '../env';
import { log } from '../lib/logger';
import { ApiResponse, AdminControlRequest } from '../types';

const router = Router();

/**
 * Middleware to verify admin API key
 */
function verifyAdminKey(req: Request, res: Response, next: Function) {
  const apiKey = req.headers['x-admin-key'] || req.body.adminApiKey;

  if (!apiKey || apiKey !== adminApiKey) {
    log.warn('Unauthorized admin attempt', {
      ip: req.ip,
      path: req.path,
      key: apiKey ? 'invalid' : 'missing',
    });

    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or missing admin API key',
      timestamp: Date.now(),
    });
  }

  next();
}

/**
 * POST /api/admin/control - Pause/Resume system
 */
router.post('/control', verifyAdminKey, async (req: Request, res: Response) => {
  try {
    const { action } = req.body as AdminControlRequest;

    log.info('[ADMIN] Control action', { action, ip: req.ip });

    let message = '';

    switch (action) {
      case 'pause':
        await pauseMonitoring();
        message = 'System monitoring paused';
        break;

      case 'resume':
        await resumeMonitoring();
        message = 'System monitoring resumed';
        break;

      case 'status':
        const systemStatus = await getSystemStatus();
        const schedulerStatus = getSchedulerStatus();
        
        return res.json({
          success: true,
          data: {
            systemStatus,
            schedulerStatus,
          },
          timestamp: Date.now(),
        });

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Use: pause, resume, or status',
          timestamp: Date.now(),
        });
    }

    const response: ApiResponse = {
      success: true,
      data: { message, action },
      timestamp: Date.now(),
    };

    log.api('POST', '/api/admin/control', 200, { action });
    res.json(response);
  } catch (error) {
    log.error('[ADMIN] Control error', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/admin/force-check - Force immediate monitoring check
 */
router.post('/force-check', verifyAdminKey, async (req: Request, res: Response) => {
  try {
    log.info('[ADMIN] Force check triggered', { ip: req.ip });

    // Run check asynchronously
    forceCheck().catch(error => {
      log.error('[ADMIN] Force check failed', error);
    });

    const response: ApiResponse = {
      success: true,
      data: { message: 'Force check initiated' },
      timestamp: Date.now(),
    };

    log.api('POST', '/api/admin/force-check', 200);
    res.json(response);
  } catch (error) {
    log.error('[ADMIN] Force check error', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/admin/health - System health check
 */
router.get('/health', verifyAdminKey, async (req: Request, res: Response) => {
  try {
    const solanaConnection = await checkConnection();
    const systemStatus = await getSystemStatus();
    const schedulerStatus = getSchedulerStatus();

    const health = {
      solana: solanaConnection ? 'healthy' : 'unhealthy',
      database: 'healthy', // If we got here, DB is working
      scheduler: schedulerStatus.isRunning ? 'running' : 'stopped',
      systemPaused: systemStatus.is_paused,
      lastCheck: systemStatus.last_check_timestamp,
      errorCount: systemStatus.error_count,
      lastError: systemStatus.last_error,
    };

    const response: ApiResponse = {
      success: true,
      data: health,
      timestamp: Date.now(),
    };

    log.api('GET', '/api/admin/health', 200);
    res.json(response);
  } catch (error) {
    log.error('[ADMIN] Health check error', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    });
  }
});

export default router;