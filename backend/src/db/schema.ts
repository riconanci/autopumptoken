import { Pool } from 'pg';
import { databaseUrl } from '../env';
import { log } from '../lib/logger';

// Create PostgreSQL connection pool
export const pool = new Pool({
  connectionString: databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
pool.on('connect', () => {
  log.info('Database connection established');
});

pool.on('error', (err) => {
  log.error('Database connection error', err);
});

// SQL Schema definitions
export const SCHEMA_SQL = `
-- Claims table: Records all fee claims from Pump.fun
CREATE TABLE IF NOT EXISTS claims (
  id SERIAL PRIMARY KEY,
  signature VARCHAR(88) UNIQUE NOT NULL,
  claimed_amount BIGINT NOT NULL, -- in lamports
  treasury_amount BIGINT NOT NULL, -- in lamports
  buyback_amount BIGINT NOT NULL, -- in lamports
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  block_number BIGINT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  CONSTRAINT claims_status_check CHECK (status IN ('pending', 'confirmed', 'failed'))
);

-- Buybacks table: Records all token buyback transactions
CREATE TABLE IF NOT EXISTS buybacks (
  id SERIAL PRIMARY KEY,
  claim_id INTEGER REFERENCES claims(id) ON DELETE CASCADE,
  signature VARCHAR(88) UNIQUE NOT NULL,
  tokens_purchased NUMERIC(30, 0) NOT NULL, -- store as numeric to avoid precision loss
  sol_spent BIGINT NOT NULL, -- in lamports
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  CONSTRAINT buybacks_status_check CHECK (status IN ('pending', 'confirmed', 'failed'))
);

-- Burns table: Records all token burn transactions to incinerator
CREATE TABLE IF NOT EXISTS burns (
  id SERIAL PRIMARY KEY,
  buyback_id INTEGER REFERENCES buybacks(id) ON DELETE CASCADE,
  signature VARCHAR(88) UNIQUE NOT NULL,
  tokens_burned NUMERIC(30, 0) NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  CONSTRAINT burns_status_check CHECK (status IN ('pending', 'confirmed', 'failed'))
);

-- Monitor checks table: Logs all fee monitoring checks
CREATE TABLE IF NOT EXISTS monitor_checks (
  id SERIAL PRIMARY KEY,
  claimable_fees BIGINT NOT NULL, -- in lamports
  threshold BIGINT NOT NULL, -- in lamports
  triggered BOOLEAN NOT NULL DEFAULT false,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  notes TEXT
);

-- System status table: Stores current system state
CREATE TABLE IF NOT EXISTS system_status (
  id INTEGER PRIMARY KEY DEFAULT 1,
  is_paused BOOLEAN NOT NULL DEFAULT false,
  last_check_timestamp TIMESTAMP,
  total_checks INTEGER NOT NULL DEFAULT 0,
  total_claims INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_error_timestamp TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insert initial system status row
INSERT INTO system_status (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_claims_timestamp ON claims(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_buybacks_claim_id ON buybacks(claim_id);
CREATE INDEX IF NOT EXISTS idx_buybacks_timestamp ON buybacks(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_burns_buyback_id ON burns(buyback_id);
CREATE INDEX IF NOT EXISTS idx_burns_timestamp ON burns(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_checks_timestamp ON monitor_checks(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_checks_triggered ON monitor_checks(triggered);

-- Views for analytics

-- Total stats view
CREATE OR REPLACE VIEW stats_total AS
SELECT 
  COALESCE(SUM(claimed_amount), 0) as total_claimed_fees,
  COALESCE(SUM(treasury_amount), 0) as total_treasury_transferred,
  COALESCE(SUM(buyback_amount), 0) as total_buyback_spent,
  COUNT(*) as total_claims,
  COUNT(*) FILTER (WHERE status = 'confirmed') as successful_claims,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_claims
FROM claims;

-- Buyback stats view
CREATE OR REPLACE VIEW stats_buybacks AS
SELECT 
  COALESCE(SUM(tokens_purchased::NUMERIC), 0) as total_tokens_purchased,
  COALESCE(SUM(sol_spent), 0) as total_sol_spent,
  COUNT(*) as total_buybacks,
  COUNT(*) FILTER (WHERE status = 'confirmed') as successful_buybacks,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_buybacks
FROM buybacks;

-- Burn stats view
CREATE OR REPLACE VIEW stats_burns AS
SELECT 
  COALESCE(SUM(tokens_burned::NUMERIC), 0) as total_tokens_burned,
  COUNT(*) as total_burns,
  COUNT(*) FILTER (WHERE status = 'confirmed') as successful_burns,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_burns
FROM burns;

-- Recent activity view (last 100 transactions)
CREATE OR REPLACE VIEW recent_activity AS
SELECT 
  'claim' as type,
  signature,
  claimed_amount as amount,
  timestamp,
  status
FROM claims
UNION ALL
SELECT 
  'buyback' as type,
  signature,
  sol_spent as amount,
  timestamp,
  status
FROM buybacks
UNION ALL
SELECT 
  'burn' as type,
  signature,
  tokens_burned::BIGINT as amount,
  timestamp,
  status
FROM burns
ORDER BY timestamp DESC
LIMIT 100;
`;

// Initialize database schema
export async function initializeDatabase(): Promise<void> {
  try {
    log.info('Initializing database schema...');
    
    await pool.query(SCHEMA_SQL);
    
    log.info('Database schema initialized successfully');
  } catch (error) {
    log.error('Failed to initialize database schema', error);
    throw error;
  }
}

// Health check
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW()');
    log.debug('Database health check passed', { time: result.rows[0].now });
    return true;
  } catch (error) {
    log.error('Database health check failed', error);
    return false;
  }
}

// Graceful shutdown
export async function closeDatabase(): Promise<void> {
  try {
    await pool.end();
    log.info('Database connections closed');
  } catch (error) {
    log.error('Error closing database connections', error);
  }
}

// Export pool for direct queries
export default pool;