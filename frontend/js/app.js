// AUTO BURN TEK - MAIN APPLICATION
// Load config from config.js
const CONFIG = typeof SITE_CONFIG !== 'undefined' ? SITE_CONFIG : {
    API_BASE: 'https://autopump-backend-d0sd6bl89-riconancis-projects.vercel.app',
    REFRESH_INTERVAL: 30000,
    TOKEN_MINT: '9AV236iTUAhkJz2vwjKW8rCTssdfdsfdsffsdfsdf7M4pump',
    TOTAL_SUPPLY: 1000000000,
    TOKEN_SYMBOL: 'ABT',
    LINKS: {
        PUMP_FUN: 'https://pump.fun/coin/9AV236iTUAhkJz2vwjKW8rCTsgH7TDNU9CiY67M4pump',
        TWITTER: 'https://x.com/AutoBurnTek'
    },
    DISPLAY: {
        SHOW_FULL_ADDRESS: true,
        BURNS_PER_PAGE: 10
    }
};

// Global state
let burnChart = null;
let currentTimeframe = '24h';
let refreshTimer = CONFIG.REFRESH_INTERVAL / 1000;
let allBurns = [];
let displayedBurns = CONFIG.DISPLAY?.BURNS_PER_PAGE || 10;

// ✅ NEW: Store previous values to prevent unnecessary animations
let previousValues = {
    totalBurned: 0,
    burnedPercent: 0,
    solSpent: 0,
    burned24h: 0,
    events24h: 0,
    avgBurn24h: 0,
    largest24h: 0
};

// INITIALIZATION
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🔥 Auto Burn Tek Dashboard Initializing...');
    displayContractAddress();
    initializeSocialLinks();
    initializeBurnChart();
    await fetchAndUpdateAllData();
    startAutoRefresh();
    console.log('✅ Dashboard loaded successfully');
});

// CONTRACT ADDRESS DISPLAY
function displayContractAddress() {
    const addressElement = document.getElementById('contractAddress');
    // Always show full address
    addressElement.textContent = CONFIG.TOKEN_MINT;
}

// ✅ NEW: Click address to copy
function copyContractAddress() {
    navigator.clipboard.writeText(CONFIG.TOKEN_MINT);
    showNotification('Contract address copied! 📋');
}

// SOCIAL LINKS INITIALIZATION
function initializeSocialLinks() {
    const linksContainer = document.getElementById('socialLinks');
    if (!linksContainer) return;
    
    let linksHTML = '';
    
    // Pump.fun link
    if (CONFIG.LINKS.PUMP_FUN) {
        linksHTML += `<a href="${CONFIG.LINKS.PUMP_FUN}" target="_blank" rel="noopener" class="social-link">
            <span class="social-icon">🚀</span> Pump.fun
        </a>`;
    }
    
    // Twitter/X link - Changed to "X"
    if (CONFIG.LINKS.TWITTER) {
        linksHTML += `<a href="${CONFIG.LINKS.TWITTER}" target="_blank" rel="noopener" class="social-link">
            <span class="social-icon">𝕏</span> 
        </a>`;
    }
    
    // Optional: Website link
    if (CONFIG.LINKS.WEBSITE) {
        linksHTML += `<a href="${CONFIG.LINKS.WEBSITE}" target="_blank" rel="noopener" class="social-link">
            <span class="social-icon">🌐</span> Website
        </a>`;
    }
    
    // Optional: Telegram link
    if (CONFIG.LINKS.TELEGRAM) {
        linksHTML += `<a href="${CONFIG.LINKS.TELEGRAM}" target="_blank" rel="noopener" class="social-link">
            <span class="social-icon">💬</span> Telegram
        </a>`;
    }
    
    linksContainer.innerHTML = linksHTML;
}

// DATA FETCHING
async function fetchAndUpdateAllData() {
    try {
        console.log('Fetching data from backend...');
        const response = await fetch(`${CONFIG.API_BASE}/stats/dashboard`);
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Unknown error');
        console.log('Data received:', data);
        updateMetrics(data.data.stats, data.data.recentTransactions);
        update24HourStats(data.data.recentTransactions);
        updateChart(data.data.burnChartData);
        updateBurnsFeed(data.data.recentTransactions);
        updateShareText(data.data.stats, data.data.recentTransactions);
    } catch (error) {
        console.error('Error fetching data:', error);
        showNotification('Failed to load data. Retrying...', 'error');
        if (CONFIG.API_BASE.includes('localhost')) {
            console.log('Using mock data for development...');
            useMockData();
        }
    }
}

// MOCK DATA (for testing)
function useMockData() {
    const mockStats = {
        totalTokensBurned: '1234567',
        totalBuybackSpent: 45.67,
        totalBurns: 156,
        totalClaims: 52,
    };
    const mockTransactions = [];
    for (let i = 0; i < 10; i++) {
        mockTransactions.push({
            type: 'burn',
            signature: `mock${i}${Math.random().toString(36).substring(7)}...`,
            amount: Math.floor(Math.random() * 200000) + 50000,
            timestamp: new Date(Date.now() - i * 600000).toISOString(),
            status: 'confirmed',
            sol_spent: (Math.random() * 0.02 + 0.001).toFixed(4),
        });
    }
    const mockChartData = [];
    let cumulative = 0;
    for (let i = 0; i < 30; i++) {
        cumulative += Math.floor(Math.random() * 50000) + 10000;
        mockChartData.push({
            timestamp: new Date(Date.now() - (29 - i) * 86400000).toISOString(),
            cumulativeBurned: cumulative,
        });
    }
    updateMetrics(mockStats, mockTransactions);
    update24HourStats(mockTransactions);
    updateChart(mockChartData);
    updateBurnsFeed(mockTransactions);
    updateShareText(mockStats, mockTransactions);
}

// ✅ UPDATED: UPDATE METRICS - Only animate if values changed
function updateMetrics(stats, transactions) {
    const totalBurned = Number(stats.totalTokensBurned || 0);
    const burnedPercent = parseFloat(((totalBurned / CONFIG.TOTAL_SUPPLY) * 100).toFixed(2));
    
    // Calculate total SOL spent from actual burn transactions
    const confirmedBurns = transactions.filter(tx => tx.type === 'burn' && tx.status === 'confirmed');
    const totalSolBurned = confirmedBurns.reduce((sum, tx) => {
        const solSpent = tx.sol_spent || 0;
        return sum + Number(solSpent);
    }, 0);
    
    // ✅ Only update if value changed
    if (totalBurned !== previousValues.totalBurned) {
        console.log(`Total Burned changed: ${previousValues.totalBurned} → ${totalBurned}`);
        animateValue('totalBurned', previousValues.totalBurned, totalBurned, 2000, formatNumber);
        previousValues.totalBurned = totalBurned;
    }
    
    if (burnedPercent !== previousValues.burnedPercent) {
        console.log(`Burned Percent changed: ${previousValues.burnedPercent} → ${burnedPercent}`);
        animateValue('burnedPercent', previousValues.burnedPercent, burnedPercent, 2000, (val) => val.toFixed(2) + '%');
        previousValues.burnedPercent = burnedPercent;
    }
    
    if (totalSolBurned !== previousValues.solSpent) {
        console.log(`SOL Spent changed: ${previousValues.solSpent} → ${totalSolBurned}`);
        animateValue('solSpent', previousValues.solSpent, totalSolBurned, 2000, (val) => val.toFixed(4));
        previousValues.solSpent = totalSolBurned;
    }
}

// ✅ UPDATED: UPDATE 24 HOUR STATS - Only update if values changed
function update24HourStats(transactions) {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const burns24h = transactions.filter(tx => {
        return tx.type === 'burn' && tx.status === 'confirmed' && new Date(tx.timestamp).getTime() > oneDayAgo;
    });
    
    const totalBurned = burns24h.reduce((sum, tx) => sum + Number(tx.amount), 0);
    const burnCount = burns24h.length;
    const avgBurn = burnCount > 0 ? Math.floor(totalBurned / burnCount) : 0;
    const largestBurn = burnCount > 0 ? Math.max(...burns24h.map(tx => Number(tx.amount))) : 0;
    
    // ✅ Only update if value changed
    if (totalBurned !== previousValues.burned24h) {
        document.getElementById('burned24h').textContent = formatNumber(totalBurned);
        previousValues.burned24h = totalBurned;
    }
    
    if (burnCount !== previousValues.events24h) {
        document.getElementById('events24h').textContent = burnCount;
        previousValues.events24h = burnCount;
    }
    
    if (avgBurn !== previousValues.avgBurn24h) {
        document.getElementById('avgBurn24h').textContent = formatNumber(avgBurn);
        previousValues.avgBurn24h = avgBurn;
    }
    
    if (largestBurn !== previousValues.largest24h) {
        document.getElementById('largest24h').textContent = formatNumber(largestBurn);
        previousValues.largest24h = largestBurn;
    }
}

// CHART INITIALIZATION
function initializeBurnChart() {
    const ctx = document.getElementById('burnChart').getContext('2d');
    burnChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Cumulative Tokens Burned',
                data: [],
                borderColor: '#ff6b35',
                backgroundColor: 'rgba(255, 107, 53, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#ff6b35',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1a1a1a',
                    titleColor: '#ff6b35',
                    bodyColor: '#ffffff',
                    borderColor: '#ff6b35',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return `Burned: ${formatNumber(context.parsed.y)} tokens`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#2a2a2a', drawBorder: false },
                    ticks: {
                        color: '#a0a0a0',
                        callback: function(value) {
                            return formatNumber(value);
                        }
                    }
                },
                x: {
                    grid: { color: '#2a2a2a', drawBorder: false },
                    ticks: { color: '#a0a0a0', maxRotation: 45, minRotation: 45 }
                }
            },
            interaction: { intersect: false, mode: 'index' }
        }
    });
}

// UPDATE CHART
function updateChart(chartData) {
    if (!burnChart || !chartData || chartData.length === 0) return;
    const labels = chartData.map(d => formatChartDate(d.timestamp));
    const data = chartData.map(d => Number(d.cumulativeBurned));
    burnChart.data.labels = labels;
    burnChart.data.datasets[0].data = data;
    burnChart.update('none');
}

function changeTimeframe(timeframe) {
    currentTimeframe = timeframe;
    document.querySelectorAll('.chart-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    fetchAndUpdateAllData();
}

// UPDATE BURNS FEED
function updateBurnsFeed(transactions) {
    const burnsContainer = document.getElementById('burnsContainer');
    const burns = transactions.filter(tx => tx.type === 'burn' && tx.status === 'confirmed');
    allBurns = burns;
    if (burns.length === 0) {
        burnsContainer.innerHTML = '<div class="loading">No burns yet. Waiting for first burn...</div>';
        return;
    }
    const burnsToDisplay = burns.slice(0, displayedBurns);
    burnsContainer.innerHTML = burnsToDisplay.map((burn, index) => {
        const isNew = index === 0 && burn.isNew;
        return createBurnCard(burn, isNew);
    }).join('');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (burns.length > displayedBurns) {
        loadMoreBtn.style.display = 'block';
    } else {
        loadMoreBtn.style.display = 'none';
    }
}

function createBurnCard(burn, isNew = false) {
    const timeAgo = getTimeAgo(burn.timestamp);
    const tokensAmount = formatNumber(burn.amount);
    let solAmount = burn.sol_spent || burn.solSpent || burn.sol_amount || 0;
    if (typeof solAmount === 'number') {
        solAmount = solAmount.toFixed(6);
    } else if (typeof solAmount === 'string') {
        const parsed = parseFloat(solAmount);
        solAmount = isNaN(parsed) ? '0.000000' : parsed.toFixed(6);
    } else {
        solAmount = '0.000000';
    }
    const shortSig = `${burn.signature.slice(0, 8)}...${burn.signature.slice(-6)}`;
    const solscanUrl = `https://solscan.io/tx/${burn.signature}`;
    return `
        <div class="burn-card ${isNew ? 'new' : ''}">
            <div class="burn-header">
                <div class="burn-time">🕐 ${timeAgo}</div>
            </div>
            <div class="burn-details">
                <div class="burn-detail">
                    <span class="burn-detail-icon">🔥</span>
                    <span class="burn-detail-text">${tokensAmount} tokens burned</span>
                </div>
                <div class="burn-detail">
                    <span class="burn-detail-icon">💰</span>
                    <span class="burn-detail-text">${solAmount} SOL used</span>
                </div>
                <div class="burn-detail">
                    <a href="${solscanUrl}" target="_blank" rel="noopener" class="burn-link">
                        🔗 ${shortSig} →
                    </a>
                </div>
            </div>
        </div>
    `;
}

function loadMoreBurns() {
    displayedBurns += 10;
    updateBurnsFeed(allBurns);
}

// UPDATE SHARE TEXT
function updateShareText(stats, transactions) {
    const totalBurned = formatNumber(stats.totalTokensBurned || 0);
    const lastBurn = transactions.find(tx => tx.type === 'burn' && tx.status === 'confirmed');
    const lastBurnAmount = lastBurn ? formatNumber(lastBurn.amount) : '0';
    document.getElementById('shareLastBurn').textContent = lastBurnAmount;
    document.getElementById('shareTotalBurned').textContent = totalBurned;
}

// SHARE FUNCTIONS
function copyShareText() {
    const sharePreview = document.getElementById('sharePreview');
    const text = sharePreview.textContent.trim();
    navigator.clipboard.writeText(text);
    showNotification('Share text copied! 📋');
}

function shareOnTwitter() {
    const lastBurn = document.getElementById('shareLastBurn').textContent;
    const totalBurned = document.getElementById('shareTotalBurned').textContent;
    const tweetText = `🔥 Just burned ${lastBurn} $${CONFIG.TOKEN_SYMBOL} tokens!\n\n${totalBurned} tokens permanently destroyed so far.\n\nWatch the supply shrink LIVE at autopumptek.com 🔥\n\n#AutoBurnTek #Deflationary #Solana`;
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(tweetUrl, '_blank', 'width=550,height=420');
}

// AUTO REFRESH
function startAutoRefresh() {
    setInterval(() => {
        refreshTimer--;
        if (refreshTimer <= 0) refreshTimer = CONFIG.REFRESH_INTERVAL / 1000;
        document.getElementById('refreshTimer').textContent = `Updating in ${refreshTimer}s`;
    }, 1000);
    setInterval(() => {
        console.log('Auto-refreshing data...');
        fetchAndUpdateAllData();
    }, CONFIG.REFRESH_INTERVAL);
}

// UTILITY FUNCTIONS
function formatNumber(num) {
    return Math.floor(Number(num)).toLocaleString('en-US');
}

function formatChartDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getTimeAgo(timestamp) {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diffMs = now - then;
    
    // ✅ ADD THIS: Handle future timestamps (server clock ahead of browser)
    if (diffMs < 0) {
        return 'Just now';
    }
    // ✅ END OF NEW CODE
    
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 5) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

function animateValue(id, start, end, duration, formatter = (val) => Math.floor(val)) {
    const element = document.getElementById(id);
    if (!element) return;
    
    // ✅ If values are the same, don't animate
    if (start === end) {
        element.textContent = formatter(end);
        return;
    }
    
    const startTime = performance.now();
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = start + (end - start) * easeOut;
        element.textContent = formatter(current);
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `position: fixed; top: 20px; right: 20px; background: ${type === 'error' ? '#f44336' : '#4caf50'}; color: white; padding: 16px 24px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10000; animation: slideInRight 0.3s ease-out; font-weight: 600;`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// COMING SOON COLLAPSE/EXPAND
function toggleComingSoon() {
    const content = document.getElementById('comingSoonContent');
    const icon = document.querySelector('.toggle-icon');
    
    content.classList.toggle('collapsed');
    icon.classList.toggle('rotated');
}

// LIVE TIMESTAMP UPDATES
setInterval(() => {
    document.querySelectorAll('.burn-time').forEach((element, index) => {
        if (allBurns[index]) {
            element.textContent = '🕐 ' + getTimeAgo(allBurns[index].timestamp);
        }
    });
}, 60000);

console.log('🔥 Auto Burn Tek Dashboard Ready!');