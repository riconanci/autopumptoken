#!/bin/bash

# ===========================================
# AUTO PUMP TOKEN - MONITORING SCRIPT
# ===========================================
# Quick status check for the system
# Usage: ./scripts/monitor.sh [admin_key]
# ===========================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_BASE="${API_BASE:-http://localhost:3000}"
ADMIN_KEY="${1:-${ADMIN_API_KEY}}"

# Functions
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

check_health() {
    print_header "HEALTH CHECK"
    
    RESPONSE=$(curl -s "${API_BASE}/health")
    STATUS=$(echo $RESPONSE | jq -r '.status' 2>/dev/null || echo "error")
    
    if [ "$STATUS" = "healthy" ]; then
        print_success "Server is healthy"
    else
        print_error "Server health check failed"
        exit 1
    fi
}

check_stats() {
    print_header "SYSTEM STATISTICS"
    
    RESPONSE=$(curl -s "${API_BASE}/api/stats")
    
    if [ $? -eq 0 ]; then
        echo "$RESPONSE" | jq -r '
            "Total Claimed: \(.data.totalClaimedFees) SOL",
            "Total Burned: \(.data.totalTokensBurned) tokens",
            "Treasury: \(.data.totalTreasuryTransferred) SOL",
            "Claims: \(.data.totalClaims)",
            "Current Claimable: \(.data.currentClaimableFees) SOL",
            "Status: \(.data.systemStatus)"
        ' 2>/dev/null
    else
        print_error "Failed to fetch stats"
    fi
}

check_scheduler() {
    print_header "SCHEDULER STATUS"
    
    RESPONSE=$(curl -s "${API_BASE}/api/stats/scheduler")
    
    if [ $? -eq 0 ]; then
        IS_RUNNING=$(echo "$RESPONSE" | jq -r '.data.isRunning' 2>/dev/null)
        NEXT_CHECK=$(echo "$RESPONSE" | jq -r '.data.nextCheckIn' 2>/dev/null)
        CHECKS=$(echo "$RESPONSE" | jq -r '.data.checksPerformed' 2>/dev/null)
        CLAIMS=$(echo "$RESPONSE" | jq -r '.data.claimsTriggered' 2>/dev/null)
        
        if [ "$IS_RUNNING" = "true" ]; then
            print_success "Scheduler is running"
            echo "  Next check in: ${NEXT_CHECK}s"
            echo "  Checks performed: ${CHECKS}"
            echo "  Claims triggered: ${CLAIMS}"
        else
            print_error "Scheduler is NOT running"
        fi
    else
        print_error "Failed to fetch scheduler status"
    fi
}

check_recent_transactions() {
    print_header "RECENT TRANSACTIONS (Last 5)"
    
    RESPONSE=$(curl -s "${API_BASE}/api/stats/history?limit=5")
    
    if [ $? -eq 0 ]; then
        echo "$RESPONSE" | jq -r '.data[] | 
            "\(.type | ascii_upcase) | \(.amount) | \(.status) | \(.signature[0:8])..."
        ' 2>/dev/null | while read line; do
            if [[ $line == *"confirmed"* ]]; then
                echo -e "${GREEN}$line${NC}"
            elif [[ $line == *"failed"* ]]; then
                echo -e "${RED}$line${NC}"
            else
                echo -e "${YELLOW}$line${NC}"
            fi
        done
    else
        print_error "Failed to fetch transaction history"
    fi
}

check_admin_health() {
    if [ -z "$ADMIN_KEY" ]; then
        print_warning "Admin key not provided, skipping admin health check"
        print_warning "Usage: $0 <admin_key>"
        return
    fi
    
    print_header "ADMIN HEALTH CHECK"
    
    RESPONSE=$(curl -s -H "x-admin-key: ${ADMIN_KEY}" "${API_BASE}/api/admin/health")
    
    if [ $? -eq 0 ]; then
        SOLANA=$(echo "$RESPONSE" | jq -r '.data.solana' 2>/dev/null)
        DATABASE=$(echo "$RESPONSE" | jq -r '.data.database' 2>/dev/null)
        SCHEDULER=$(echo "$RESPONSE" | jq -r '.data.scheduler' 2>/dev/null)
        PAUSED=$(echo "$RESPONSE" | jq -r '.data.systemPaused' 2>/dev/null)
        ERRORS=$(echo "$RESPONSE" | jq -r '.data.errorCount' 2>/dev/null)
        
        # Solana
        if [ "$SOLANA" = "healthy" ]; then
            print_success "Solana RPC: healthy"
        else
            print_error "Solana RPC: unhealthy"
        fi
        
        # Database
        if [ "$DATABASE" = "healthy" ]; then
            print_success "Database: healthy"
        else
            print_error "Database: unhealthy"
        fi
        
        # Scheduler
        if [ "$SCHEDULER" = "running" ]; then
            print_success "Scheduler: running"
        else
            print_warning "Scheduler: stopped"
        fi
        
        # Pause state
        if [ "$PAUSED" = "false" ]; then
            print_success "System: active"
        else
            print_warning "System: PAUSED"
        fi
        
        # Errors
        echo "  Error count: ${ERRORS}"
    else
        print_error "Failed to fetch admin health (check admin key)"
    fi
}

check_claim_needed() {
    if [ -z "$ADMIN_KEY" ]; then
        return
    fi
    
    print_header "CLAIM CHECK"
    
    RESPONSE=$(curl -s -H "x-admin-key: ${ADMIN_KEY}" "${API_BASE}/api/claim/check")
    
    if [ $? -eq 0 ]; then
        SHOULD_CLAIM=$(echo "$RESPONSE" | jq -r '.data.shouldClaim' 2>/dev/null)
        CLAIMABLE=$(echo "$RESPONSE" | jq -r '.data.claimableFees' 2>/dev/null)
        REASON=$(echo "$RESPONSE" | jq -r '.data.reason' 2>/dev/null)
        
        if [ "$SHOULD_CLAIM" = "true" ]; then
            print_success "Claim recommended: ${CLAIMABLE} SOL available"
        else
            echo "  ${REASON}"
        fi
    fi
}

show_logs() {
    print_header "RECENT LOGS (Last 20 lines)"
    
    if [ -f "logs/combined.log" ]; then
        tail -n 20 logs/combined.log
    else
        print_warning "No log file found at logs/combined.log"
    fi
}

# Main execution
main() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   AUTO PUMP TOKEN MONITOR              ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
    
    check_health
    echo ""
    
    check_stats
    echo ""
    
    check_scheduler
    echo ""
    
    check_recent_transactions
    echo ""
    
    check_admin_health
    echo ""
    
    check_claim_needed
    echo ""
    
    # Optional: show logs
    if [ "$2" = "--logs" ]; then
        show_logs
        echo ""
    fi
    
    print_header "MONITORING COMPLETE"
    echo -e "${GREEN}All checks completed successfully${NC}"
    echo ""
    echo "Tips:"
    echo "  - Run with admin key: $0 <admin_key>"
    echo "  - Show logs: $0 <admin_key> --logs"
    echo "  - Set API_BASE: API_BASE=https://api.autopump.com $0"
    echo ""
}

# Check for jq
if ! command -v jq &> /dev/null; then
    print_error "jq is required but not installed"
    echo "Install: sudo apt install jq (Ubuntu) or brew install jq (Mac)"
    exit 1
fi

# Run main function
main "$@"