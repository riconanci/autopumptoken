// FRONTEND CONFIGURATION
// Edit these values to customize your dashboard

const SITE_CONFIG = {
    // Token Information
    TOKEN_MINT: '7Zyhj43gwm8RwZmuymzggCcqHxPVQicvqj2jgcNpump',
    TOKEN_SYMBOL: 'ABT',
    TOKEN_NAME: 'Auto Burn Tek',
    TOTAL_SUPPLY: 1000000000,
    
    // API Configuration
    API_BASE: 'https://autopump-backend-v2-deyum8cnu-riconancis-projects.vercel.app', // Will be https://yoursite.vercel.app/api
    REFRESH_INTERVAL: 30000, // 30 seconds
    
    // Social Links (EDIT THESE!)
    LINKS: {
        PUMP_FUN: 'https://pump.fun/coin/7Zyhj43gwm8RwZmuymzggCcqHxPVQicvqj2jgcNpump',
        TWITTER: 'https://x.com/AutoBurnTek',  // ← CHANGES X
    //    WEBSITE: 'https://autopumptoken.vercel.app',              // ← OPTIONAL: Add your site
    //    TELEGRAM: 'https://t.me/YourTelegramGroup'       // ← OPTIONAL: Add your TG
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