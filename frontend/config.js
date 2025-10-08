// FRONTEND CONFIGURATION
// Edit these values to customize your dashboard

const SITE_CONFIG = {
    // Token Information
    TOKEN_MINT: '9AV236iTUAhkJz2vwjKW8rCTsgH7TDNU9CiY67M4pump',
    TOKEN_SYMBOL: 'ABT',
    TOKEN_NAME: 'Auto Burn Tek',
    TOTAL_SUPPLY: 10000000,
    
    // API Configuration
    API_BASE: 'http://localhost:3000/api',
    REFRESH_INTERVAL: 30000, // 30 seconds
    
    // Social Links (EDIT THESE!)
    LINKS: {
        PUMP_FUN: 'https://pump.fun/coin/9AV236iTUAhkJz2vwjKW8rCTsgH7TDNU9CiY67M4pump',
        TWITTER: 'https://twitter.com/YourTokenHandle',  // ← CHANGES X
        WEBSITE: 'https://yourwebsite.com',              // ← OPTIONAL: Add your site
        TELEGRAM: 'https://t.me/YourTelegramGroup'       // ← OPTIONAL: Add your TG
    },
    
    // Display Settings
    DISPLAY: {
        SHOW_FULL_ADDRESS: true,  // Set to false to show shortened address
        BURNS_PER_PAGE: 10,
        CHART_ANIMATION: true
    }
};

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SITE_CONFIG;
}