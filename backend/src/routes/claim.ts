import { Router, Request, Response } from 'express';
import { executeClaimFlow } from '../services/claimOrchestrator';
import { shouldClaimFees } from '../services/feeMonitor';
import { isClaimInProgress } from '../scheduler'; // ✅ ADDED: Import lock check
import { adminApiKey, enableManualClaim } from '../env';
import { log } from '../lib/logger';
import { ApiResponse, ManualClaimRequest } from '../types';

const router = Router();

/**
 * Middleware to verify admin API key
 */
function verifyAdminKey(req: Request, res: Response, next: Function) {
  const apiKey = req.headers['x-admin-key'] || req.body.adminApiKey;

  if (!apiKey || apiKey !== adminApiKey) {
    log.warn('Unauthorized claim attempt', {
      ip: req.ip,
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
 * POST /api/claim - Manually trigger claim process
 */
router.post('/', verifyAdminKey, async (req: Request, res: Response) => {
  try {
    if (!enableManualClaim) {
      return res.status(403).json({
        success: false,
        error: 'Manual claims are disabled',
        timestamp: Date.now(),
      });
    }

    // ✅ ADDED: Check if claim already in progress
    if (isClaimInProgress()) {
      log.warn('[MANUAL CLAIM] Rejected - claim already in progress', { ip: req.ip });
      return res.status(409).json({
        success: false,
        error: 'Claim operation already in progress. Please wait for it to complete.',
        timestamp: Date.now(),
      });
    }

    const { force } = req.body as ManualClaimRequest;

    log.info('[MANUAL CLAIM] Triggered via API', { force, ip: req.ip });

    // Execute claim flow
    const result = await executeClaimFlow(force || false);

    const response: ApiResponse = {
      success: result.success,
      data: result,
      error: result.error,
      timestamp: Date.now(),
    };

    const statusCode = result.success ? 200 : 500;
    log.api('POST', '/api/claim', statusCode, { force });
    
    res.status(statusCode).json(response);
  } catch (error) {
    log.error('[MANUAL CLAIM] API error', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/claim/check - Check if claim is needed (without executing)
 */
router.get('/check', verifyAdminKey, async (req: Request, res: Response) => {
  try {
    const decision = await shouldClaimFees();

    const response: ApiResponse = {
      success: true,
      data: decision,
      timestamp: Date.now(),
    };

    log.api('GET', '/api/claim/check', 200);
    res.json(response);
  } catch (error) {
    log.error('[CLAIM CHECK] API error', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    });
  }
});

export default router;