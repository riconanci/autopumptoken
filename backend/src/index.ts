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
// MIDDLEWARE
// ========================================

// Security
app.use(helmet());
app.use(cors());

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: 'Too many requests from this IP, please try again later.',
});

app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
  log.debug('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

// ========================================
// ROUTES
// ========================================

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: Date.now(),
  });
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
    timestamp: Date.now(),
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  log.error('Express error handler', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: Date.now(),
  });
});

// ========================================
// STARTUP & SHUTDOWN
// ========================================

async function startServer() {
  try {
    log.info('='.repeat(60));
    log.info('AUTO PUMP TOKEN - DEFLATIONARY BUYBACK SYSTEM');
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
      throw new Error('Solana RPC connection failed');
    }
    log.info('✓ Solana connection established');

    // Step 3: Initialize database
    log.info('[STARTUP] Initializing database...');
    await initializeDatabase();
    const dbHealthy = await checkDatabaseConnection();
    if (!dbHealthy) {
      throw new Error('Database connection failed');
    }
    log.info('✓ Database initialized');

    // Step 4: Start Express server
    log.info('[STARTUP] Starting Express server...');
    const server = app.listen(port, () => {
      log.info(`✓ Server listening on port ${port}`);
    });

    // Step 5: Start automated scheduler
    log.info('[STARTUP] Starting automated scheduler...');
    startScheduler();
    log.info('✓ Scheduler started');

    log.info('='.repeat(60));
    log.info('SYSTEM READY');
    log.info('='.repeat(60));
    log.info(`Token: ${tokenSymbol} (${tokenMint})`);
    log.info(`API Endpoint: http://localhost:${port}`);
    log.info(`Public Stats: http://localhost:${port}/api/stats`);
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

// Start the application
startServer();