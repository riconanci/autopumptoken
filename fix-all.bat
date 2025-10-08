@echo off
REM ==========================================
REM AUTO PUMP TOKEN - Automated Fix Script
REM ==========================================
REM This fixes all import and file issues
REM ==========================================

echo.
echo ========================================
echo AUTO PUMP - Fixing Import Issues
echo ========================================
echo.

cd backend

REM 1. Move scheduler to correct location
echo [1/5] Moving scheduler.ts to correct location...
if exist src\services\sceduler.ts (
    move src\services\sceduler.ts src\scheduler.ts >nul 2>&1
    echo     - Moved sceduler.ts to scheduler.ts
) else if exist src\services\scheduler.ts (
    move src\services\scheduler.ts src\scheduler.ts >nul 2>&1
    echo     - Moved scheduler.ts from services
) else (
    echo     - scheduler.ts already in correct location
)

REM 2. Rename burns.ts to burn.ts
echo [2/5] Renaming burns.ts to burn.ts...
if exist src\services\burns.ts (
    move src\services\burns.ts src\services\burn.ts >nul 2>&1
    echo     - Renamed burns.ts to burn.ts
) else (
    echo     - burn.ts already correct
)

REM 3. Move index.ts if in routes
echo [3/5] Checking index.ts location...
if exist src\routes\index.ts (
    if not exist src\index.ts (
        move src\routes\index.ts src\index.ts >nul 2>&1
        echo     - Moved index.ts from routes to src root
    ) else (
        echo     - WARNING: index.ts exists in both locations!
    )
) else (
    echo     - index.ts in correct location
)

REM 4. Update tsconfig.json
echo [4/5] Updating tsconfig.json...
(
echo {
echo   "compilerOptions": {
echo     "target": "ES2022",
echo     "module": "commonjs",
echo     "lib": ["ES2022"],
echo     "outDir": "./dist",
echo     "rootDir": "./src",
echo     "strict": true,
echo     "esModuleInterop": true,
echo     "allowSyntheticDefaultImports": true,
echo     "skipLibCheck": true,
echo     "forceConsistentCasingInFileNames": true,
echo     "resolveJsonModule": true,
echo     "moduleResolution": "node",
echo     "types": ["node"]
echo   },
echo   "include": ["src/**/*"],
echo   "exclude": ["node_modules", "dist"]
echo }
) > tsconfig.json
echo     - tsconfig.json updated with esModuleInterop

REM 5. Create import fix instructions
echo [5/5] Creating import fix guide...
(
echo Fix these imports manually:
echo.
echo 1. src/env.ts - Line 1:
echo    Change: import dotenv from 'dotenv';
echo    To:     import * as dotenv from 'dotenv';
echo            dotenv.config^(^);
echo.
echo 2. src/lib/logger.ts - Line 1:
echo    Change: import winston from 'winston';
echo    To:     import * as winston from 'winston';
echo.
echo 3. src/routes/admin.ts - Line 12:
echo    Change: from '../../../src/types'
echo    To:     from '../types'
echo.
echo 4. src/routes/claim.ts - Line 6:
echo    Change: from '../../../src/types'
echo    To:     from '../types'
echo.
echo 5. src/routes/stats.ts - Line 7:
echo    Change: from '../../../src/types'
echo    To:     from '../types'
echo.
echo 6. src/services/burn.ts - Line 6:
echo    Change: from '../../../src/types'
echo    To:     from '../types'
echo.
echo 7. src/scheduler.ts imports:
echo    import * as cron from 'node-cron';
echo    All paths should be relative from src root
) > IMPORT_FIXES.txt

echo.
echo ========================================
echo AUTOMATED FIXES COMPLETE
echo ========================================
echo.
echo Files moved:
echo   - scheduler.ts now in src/
echo   - burn.ts renamed correctly
echo   - tsconfig.json updated
echo.
echo MANUAL FIXES NEEDED:
echo   See IMPORT_FIXES.txt for details
echo.
echo Quick fixes needed:
echo   1. In env.ts: import * as dotenv from 'dotenv';
echo   2. In logger.ts: import * as winston from 'winston';
echo   3. Change '../../../src/types' to '../types' in:
echo      - routes/admin.ts
echo      - routes/claim.ts  
echo      - routes/stats.ts
echo      - services/burn.ts
echo.
echo After manual fixes, run:
echo   npm run type-check
echo.
pause