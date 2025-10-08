import pool from './schema';
import { log } from '../lib/logger';
import {
  ClaimRecord,
  BuybackRecord,
  BurnRecord,
  MonitorCheck,
  SystemStats,
  TransactionHistoryItem,
} from '../types';

// ========================================
// CLAIM OPERATIONS
// ========================================

export async function insertClaim(
  signature: string,
  claimedAmount: number,
  treasuryAmount: number,
  buybackAmount: number
): Promise<number> {
  const query = `
    INSERT INTO claims (signature, claimed_amount, treasury_amount, buyback_amount, status)
    VALUES ($1, $2, $3, $4, 'pending')
    RETURNING id
  `;

  const result = await pool.query(query, [
    signature,
    claimedAmount,
    treasuryAmount,
    buybackAmount,
  ]);

  const claimId = result.rows[0].id;
  log.debug('Claim record inserted', { claimId, signature });
  
  return claimId;
}

export async function updateClaimStatus(
  id: number,
  status: 'confirmed' | 'failed',
  blockNumber?: number,
  errorMessage?: string
): Promise<void> {
  const query = `
    UPDATE claims 
    SET status = $1, block_number = $2, error_message = $3
    WHERE id = $4
  `;

  await pool.query(query, [status, blockNumber, errorMessage, id]);
  log.debug('Claim status updated', { id, status });
}

export async function getClaimById(id: number): Promise<ClaimRecord | null> {
  const query = 'SELECT * FROM claims WHERE id = $1';
  const result = await pool.query(query, [id]);
  
  return result.rows[0] || null;
}

export async function getRecentClaims(limit: number = 10): Promise<ClaimRecord[]> {
  const query = `
    SELECT * FROM claims 
    ORDER BY timestamp DESC 
    LIMIT $1
  `;
  
  const result = await pool.query(query, [limit]);
  return result.rows;
}

// ========================================
// BUYBACK OPERATIONS
// ========================================

export async function insertBuyback(
  claimId: number,
  signature: string,
  tokensPurchased: string,
  solSpent: number
): Promise<number> {
  const query = `
    INSERT INTO buybacks (claim_id, signature, tokens_purchased, sol_spent, status)
    VALUES ($1, $2, $3, $4, 'pending')
    RETURNING id
  `;

  const result = await pool.query(query, [
    claimId,
    signature,
    tokensPurchased,
    solSpent,
  ]);

  const buybackId = result.rows[0].id;
  log.debug('Buyback record inserted', { buybackId, claimId, signature });
  
  return buybackId;
}

export async function updateBuybackStatus(
  id: number,
  status: 'confirmed' | 'failed',
  errorMessage?: string
): Promise<void> {
  const query = `
    UPDATE buybacks 
    SET status = $1, error_message = $2
    WHERE id = $3
  `;

  await pool.query(query, [status, errorMessage, id]);
  log.debug('Buyback status updated', { id, status });
}

export async function getBuybackById(id: number): Promise<BuybackRecord | null> {
  const query = 'SELECT * FROM buybacks WHERE id = $1';
  const result = await pool.query(query, [id]);
  
  return result.rows[0] || null;
}

// ========================================
// BURN OPERATIONS
// ========================================

export async function insertBurn(
  buybackId: number,
  signature: string,
  tokensBurned: string
): Promise<number> {
  const query = `
    INSERT INTO burns (buyback_id, signature, tokens_burned, status)
    VALUES ($1, $2, $3, 'pending')
    RETURNING id
  `;

  const result = await pool.query(query, [buybackId, signature, tokensBurned]);

  const burnId = result.rows[0].id;
  log.debug('Burn record inserted', { burnId, buybackId, signature });
  
  return burnId;
}

export async function updateBurnStatus(
  id: number,
  status: 'confirmed' | 'failed',
  errorMessage?: string
): Promise<void> {
  const query = `
    UPDATE burns 
    SET status = $1, error_message = $2
    WHERE id = $3
  `;

  await pool.query(query, [status, errorMessage, id]);
  log.debug('Burn status updated', { id, status });
}

// ========================================
// MONITOR OPERATIONS
// ========================================

export async function insertMonitorCheck(
  claimableFees: number,
  threshold: number,
  triggered: boolean,
  notes?: string
): Promise<void> {
  const query = `
    INSERT INTO monitor_checks (claimable_fees, threshold, triggered, notes)
    VALUES ($1, $2, $3, $4)
  `;

  await pool.query(query, [claimableFees, threshold, triggered, notes]);
}

export async function getRecentMonitorChecks(limit: number = 100): Promise<MonitorCheck[]> {
  const query = `
    SELECT * FROM monitor_checks 
    ORDER BY timestamp DESC 
    LIMIT $1
  `;
  
  const result = await pool.query(query, [limit]);
  return result.rows;
}

// ========================================
// SYSTEM STATUS OPERATIONS
// ========================================

export async function getSystemStatus(): Promise<any> {
  const query = 'SELECT * FROM system_status WHERE id = 1';
  const result = await pool.query(query);
  
  return result.rows[0];
}

export async function updateSystemStatus(updates: {
  isPaused?: boolean;
  lastCheckTimestamp?: Date;
  totalChecks?: number;
  totalClaims?: number;
  errorCount?: number;
  lastError?: string;
}): Promise<void> {
  const fields = [];
  const values = [];
  let paramCount = 1;

  if (updates.isPaused !== undefined) {
    fields.push(`is_paused = $${paramCount++}`);
    values.push(updates.isPaused);
  }
  if (updates.lastCheckTimestamp !== undefined) {
    fields.push(`last_check_timestamp = $${paramCount++}`);
    values.push(updates.lastCheckTimestamp);
  }
  if (updates.totalChecks !== undefined) {
    fields.push(`total_checks = $${paramCount++}`);
    values.push(updates.totalChecks);
  }
  if (updates.totalClaims !== undefined) {
    fields.push(`total_claims = $${paramCount++}`);
    values.push(updates.totalClaims);
  }
  if (updates.errorCount !== undefined) {
    fields.push(`error_count = $${paramCount++}`);
    values.push(updates.errorCount);
  }
  if (updates.lastError !== undefined) {
    fields.push(`last_error = $${paramCount++}`, `last_error_timestamp = NOW()`);
    values.push(updates.lastError);
  }

  fields.push('updated_at = NOW()');

  const query = `
    UPDATE system_status 
    SET ${fields.join(', ')}
    WHERE id = 1
  `;

  await pool.query(query, values);
}

export async function pauseSystem(): Promise<void> {
  await updateSystemStatus({ isPaused: true });
  log.info('System paused via database');
}

export async function resumeSystem(): Promise<void> {
  await updateSystemStatus({ isPaused: false });
  log.info('System resumed via database');
}

// ========================================
// ANALYTICS & STATS
// ========================================

export async function getSystemStats(): Promise<SystemStats> {
  const statsQuery = `
    SELECT 
      (SELECT total_claimed_fees FROM stats_total) as total_claimed_fees,
      (SELECT total_treasury_transferred FROM stats_total) as total_treasury_transferred,
      (SELECT total_buyback_spent FROM stats_total) as total_buyback_spent,
      (SELECT total_tokens_burned FROM stats_burns) as total_tokens_burned,
      (SELECT total_claims FROM stats_total) as total_claims,
      (SELECT total_buybacks FROM stats_buybacks) as total_buybacks,
      (SELECT total_burns FROM stats_burns) as total_burns,
      (SELECT MAX(timestamp) FROM claims WHERE status = 'confirmed') as last_claim_timestamp
  `;

  const result = await pool.query(statsQuery);
  const row = result.rows[0];

  const systemStatus = await getSystemStatus();

  return {
    totalClaimedFees: Number(row.total_claimed_fees || 0) / 1e9, // Convert to SOL
    totalTreasuryTransferred: Number(row.total_treasury_transferred || 0) / 1e9,
    totalBuybackSpent: Number(row.total_buyback_spent || 0) / 1e9,
    totalTokensBurned: row.total_tokens_burned || '0',
    totalClaims: Number(row.total_claims || 0),
    totalBuybacks: Number(row.total_buybacks || 0),
    totalBurns: Number(row.total_burns || 0),
    lastClaimTimestamp: row.last_claim_timestamp ? new Date(row.last_claim_timestamp).getTime() : undefined,
    nextCheckTimestamp: 0, // Will be set by scheduler
    currentClaimableFees: 0, // Will be set by fee monitor
    systemStatus: systemStatus?.is_paused ? 'paused' : 'active',
  };
}

export async function getTransactionHistory(limit: number = 50): Promise<TransactionHistoryItem[]> {
  const query = `
    SELECT type, signature, amount, timestamp, status
    FROM recent_activity
    LIMIT $1
  `;

  const result = await pool.query(query, [limit]);

  return result.rows.map((row) => ({
    type: row.type,
    signature: row.signature,
    amount: row.type === 'burn' ? row.amount.toString() : Number(row.amount) / 1e9,
    timestamp: new Date(row.timestamp).getTime(),
    status: row.status,
    explorerUrl: `https://solscan.io/tx/${row.signature}`,
  }));
}

// ========================================
// CLEANUP & MAINTENANCE
// ========================================

export async function cleanupOldMonitorChecks(daysToKeep: number = 30): Promise<number> {
  const query = `
    DELETE FROM monitor_checks
    WHERE timestamp < NOW() - INTERVAL '${daysToKeep} days'
  `;

  const result = await pool.query(query);
  const deleted = result.rowCount || 0;
  
  log.info('Old monitor checks cleaned up', { deleted, daysToKeep });
  return deleted;
}