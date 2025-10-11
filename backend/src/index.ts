import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { port, tokenMint, tokenSymbol } from './env';
import { log } from './lib/logger';
import { initializeDatabase, checkDatabaseConnection, closeDatabase } from './db/schema';
import { startScheduler, stopScheduler } from './scheduler';
import { checkConnection } from './lib/solana';
import { verifyBurnAddress } from './services/burn';

// Import routes
import statsRoutes from './routes/stats';
import claimRoutes from './routes/claim';
import adminRoutes from './routes/admin';

const app = express();

// ========================================
// CORS - MUST BE FIRST!
// ========================================
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// ========================================
// MIDDLEWARE
// ========================================

// Security
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API
  crossOriginEmbedderPolicy: false,
}));


// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Request logging (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    log.debug('Incoming request', {
      method: req.method,
      path: req.path,
      ip: req.ip,
    });
    next();
  });
}

// ========================================
// ROUTES
// ========================================

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'Auto Pump Token API',
    version: '2.0.0',
    status: 'operational',
    timestamp: Date.now(),
    endpoints: {
      health: '/health',
      stats: '/api/stats',
      dashboard: '/api/stats/dashboard',
      claims: '/api/stats/claims',
      burns: '/api/stats/burns',
    }
  });
});

// Health check (no auth required)
app.get('/health', async (req, res) => {
  try {
    const dbHealthy = await checkDatabaseConnection();
    const solanaHealthy = await checkConnection();

    res.json({
      success: true,
      status: 'healthy',
      timestamp: Date.now(),
      checks: {
        database: dbHealthy,
        solana: solanaHealthy,
        api: true,
      },
      version: '2.0.0',
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : 'Health check failed',
    });
  }
});

// API routes
app.use('/api/stats', statsRoutes);
app.use('/api/claim', claimRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    timestamp: Date.now(),
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  log.error('Express error handler', err);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    timestamp: Date.now(),
  });
});

// ========================================
// STARTUP & SHUTDOWN (Local Development Only)
// ========================================

async function startServer() {
  try {
    log.info('='.repeat(60));
    log.info('AUTO PUMP TOKEN - DEFLATIONARY BUYBACK SYSTEM v2.0');
    log.info('='.repeat(60));

    // Step 1: Verify burn address
    log.info('[STARTUP] Verifying burn address...');
    if (!verifyBurnAddress()) {
      throw new Error('Invalid burn address configuration');
    }
    log.info('✓ Burn address verified');

    // Step 2: Check Solana connection
    log.info('[STARTUP] Testing Solana RPC connection...');
    const solanaHealthy = await checkConnection();
    if (!solanaHealthy) {
      log.warn('⚠ Solana RPC connection check failed - will retry on first request');
    } else {
      log.info('✓ Solana connection established');
    }

    // Step 3: Initialize database
    log.info('[STARTUP] Initializing database...');
    try {
      // Uncomment if you want to auto-create tables on startup
      // await initializeDatabase();
      const dbHealthy = await checkDatabaseConnection();
      if (!dbHealthy) {
        log.warn('⚠ Database connection check failed - will retry on first request');
      } else {
        log.info('✓ Database connected');
      }
    } catch (error) {
      log.warn('⚠ Database initialization skipped', error);
    }

    // Step 4: Start Express server
    log.info('[STARTUP] Starting Express server...');
    const server = app.listen(port, () => {
      log.info(`✓ Server listening on port ${port}`);
    });

    // Step 5: Start automated scheduler (ONLY in local development)
    if (process.env.NODE_ENV !== 'production') {
      log.info('[STARTUP] Starting automated scheduler...');
      startScheduler();
      log.info('✓ Scheduler started');
      log.info('ℹ Note: Scheduler runs locally. On Vercel, use Cron Jobs or keep scheduler local.');
    } else {
      log.info('[STARTUP] Scheduler disabled in production (Vercel serverless mode)');
      log.info('ℹ Keep scheduler running locally or use Vercel Cron Jobs');
    }

    log.info('='.repeat(60));
    log.info('SYSTEM READY');
    log.info('='.repeat(60));
    log.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    log.info(`Token: ${tokenSymbol} (${tokenMint})`);
    log.info(`API Endpoint: http://localhost:${port}`);
    log.info(`Public Stats: http://localhost:${port}/api/stats`);
    log.info(`Dashboard: http://localhost:${port}/api/stats/dashboard`);
    log.info('='.repeat(60));

    // Graceful shutdown
    const shutdown = async () => {
      log.info('Shutting down gracefully...');
      
      stopScheduler();
      
      server.close(() => {
        log.info('Express server closed');
      });

      await closeDatabase();
      
      log.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    log.error('Startup failed', error);
    process.exit(1);
  }
}

// ========================================
// START SERVER (Only if not in Vercel)
// ========================================

// Vercel handles server startup automatically via serverless functions
// Only start server manually in local development
if (process.env.VERCEL !== '1') {
  startServer();
} else {
  // On Vercel, just initialize what we need
  log.info('Running on Vercel - Serverless mode');
  
  // Initialize database connection pool (lightweight)
  checkDatabaseConnection().catch(err => {
    log.error('Database connection failed on Vercel startup', err);
  });
  
  // Verify burn address
  if (!verifyBurnAddress()) {
    log.error('Invalid burn address configuration');
  }
}

// ========================================
// EXPORT FOR VERCEL
// ========================================

export default app;