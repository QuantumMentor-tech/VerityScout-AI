@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

title VerityScout AI — Management ^& Launch Console

echo ===============================================================================
echo                           VERITYSCOUT AI
echo     Autonomous Multi-Source Web Research ^& Deterministic Verification
echo                      Production Release Candidate
echo ===============================================================================
echo.

:: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found in PATH.
    echo Please install Node.js LTS [v20+ recommended] from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Check npm
where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm is not found in PATH.
    echo.
    pause
    exit /b 1
)

:: Check dependencies
if not exist "node_modules\" (
    echo [INFO] node_modules directory not detected.
    echo Installing project dependencies via npm ci / npm install...
    echo.
    call npm install
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
    echo [SUCCESS] Dependencies installed successfully.
    echo.
)

:MENU
echo -------------------------------------------------------------------------------
echo Application Runtimes:
echo   [1] Start Web Development Server        (npm run dev)
echo   [2] Start Background Research Worker    (npm run worker)
echo   [3] Start Production Web Server         (npm run start)
echo.
echo Automated Testing ^& Quality Gates:
echo   [4] Full Quality Gate Verification      (Typecheck + Lint + All Tests + Build)
echo   [5] Run Unit ^& Component Tests          (npm run test:unit)
echo   [6] Run Provider Contract Tests         (npm run test:contracts)
echo   [7] Run Integration Tests               (npm run test:integration)
echo   [8] Run Security ^& Privacy Tests        (npm run test:security)
echo   [9] Run Performance Benchmark Tests     (npm run test:perf)
echo  [10] Run Deployment Readiness Tests      (npm run test:deploy)
echo  [11] Run Playwright End-to-End Tests     (npm run test:e2e)
echo  [12] Run Research Quality Benchmark CLI  (npm run benchmark)
echo.
echo Database, Build ^& Deployment:
echo  [13] Check Database Migration Status     (npm run db:status)
echo  [14] Execute Database Migrations         (npm run db:migrate)
echo  [15] Run Deployment Preflight Check      (npm run deploy:preflight)
echo  [16] Run Post-Deployment Smoke Tests     (npm run deploy:smoke)
echo  [17] Build Production Next.js Bundle     (npm run build)
echo.
echo Local Container Services (Docker Compose):
echo  [18] Start Development Services (Postgres ^& Redis)  (npm run services:up)
echo  [19] Stop Development Services                      (npm run services:down)
echo.
echo  [20] Exit
echo -------------------------------------------------------------------------------
set "CHOICE=1"
set /p "CHOICE=Enter choice (1-20) [Default: 1]: "

if "%CHOICE%"=="1" goto DEV
if "%CHOICE%"=="2" goto WORKER
if "%CHOICE%"=="3" goto START
if "%CHOICE%"=="4" goto VERIFY_ALL
if "%CHOICE%"=="5" goto TEST_UNIT
if "%CHOICE%"=="6" goto TEST_CONTRACTS
if "%CHOICE%"=="7" goto TEST_INTEGRATION
if "%CHOICE%"=="8" goto TEST_SECURITY
if "%CHOICE%"=="9" goto TEST_PERF
if "%CHOICE%"=="10" goto TEST_DEPLOY
if "%CHOICE%"=="11" goto TEST_E2E
if "%CHOICE%"=="12" goto BENCHMARK
if "%CHOICE%"=="13" goto DB_STATUS
if "%CHOICE%"=="14" goto DB_MIGRATE
if "%CHOICE%"=="15" goto DEPLOY_PREFLIGHT
if "%CHOICE%"=="16" goto DEPLOY_SMOKE
if "%CHOICE%"=="17" goto BUILD
if "%CHOICE%"=="18" goto SERVICES_UP
if "%CHOICE%"=="19" goto SERVICES_DOWN
if "%CHOICE%"=="20" goto EXIT

echo [WARN] Invalid choice "%CHOICE%". Please select 1 through 20.
echo.
goto MENU

:DEV
echo.
echo [INFO] Starting Next.js Development Server at http://localhost:3000 ...
start http://localhost:3000
echo Press Ctrl+C in this window to stop the server.
echo.
call npm run dev
goto MENU

:WORKER
echo.
echo [INFO] Starting VerityScout AI Background Research Worker Daemon...
echo Press Ctrl+C to stop the worker.
echo.
call npm run worker
goto MENU

:START
echo.
echo [INFO] Starting Production Web Server at http://localhost:3000 ...
start http://localhost:3000
call npm run start
goto MENU

:VERIFY_ALL
echo.
echo ===============================================================================
echo [INFO] Starting Complete Multi-Tier Verification Sequence...
echo ===============================================================================
echo.
echo [1/9] Strict TypeScript Typecheck...
call npm run typecheck
if %ERRORLEVEL% neq 0 goto VERIFY_FAILED

echo.
echo [2/9] ESLint 9 Checks...
call npm run lint
if %ERRORLEVEL% neq 0 goto VERIFY_FAILED

echo.
echo [3/9] Unit ^& Component Tests...
call npm run test:unit
if %ERRORLEVEL% neq 0 goto VERIFY_FAILED

echo.
echo [4/9] Provider Contract Tests...
call npm run test:contracts
if %ERRORLEVEL% neq 0 goto VERIFY_FAILED

echo.
echo [5/9] Integration Tests...
call npm run test:integration
if %ERRORLEVEL% neq 0 goto VERIFY_FAILED

echo.
echo [6/9] Security ^& Privacy Regression Tests...
call npm run test:security
if %ERRORLEVEL% neq 0 goto VERIFY_FAILED

echo.
echo [7/9] Performance Regression Tests...
call npm run test:perf
if %ERRORLEVEL% neq 0 goto VERIFY_FAILED

echo.
echo [8/9] Deployment Readiness Tests...
call npm run test:deploy
if %ERRORLEVEL% neq 0 goto VERIFY_FAILED

echo.
echo [9/9] Next.js Production Build...
call npm run build
if %ERRORLEVEL% neq 0 goto VERIFY_FAILED

echo.
echo ===============================================================================
echo [SUCCESS] All 9 verification stages passed with ZERO errors!
echo ===============================================================================
goto END_ACTION

:VERIFY_FAILED
echo.
echo ===============================================================================
echo [FAIL] Verification failed at the current stage!
echo ===============================================================================
goto END_ACTION

:TEST_UNIT
echo.
echo [INFO] Running Unit Tests (Vitest)...
call npm run test:unit
goto END_ACTION

:TEST_CONTRACTS
echo.
echo [INFO] Running Provider Contract Tests...
call npm run test:contracts
goto END_ACTION

:TEST_INTEGRATION
echo.
echo [INFO] Running Integration Tests...
call npm run test:integration
goto END_ACTION

:TEST_SECURITY
echo.
echo [INFO] Running Security ^& Privacy Tests...
call npm run test:security
goto END_ACTION

:TEST_PERF
echo.
echo [INFO] Running Performance Tests...
call npm run test:perf
goto END_ACTION

:TEST_DEPLOY
echo.
echo [INFO] Running Deployment Readiness Tests...
call npm run test:deploy
goto END_ACTION

:TEST_E2E
echo.
echo [INFO] Running Playwright End-to-End Browser Tests...
call npm run test:e2e
goto END_ACTION

:BENCHMARK
echo.
echo [INFO] Running Research Quality Benchmark CLI...
call npm run benchmark
goto END_ACTION

:DB_STATUS
echo.
echo [INFO] Checking Database Migration Status...
call npm run db:status
goto END_ACTION

:DB_MIGRATE
echo.
echo [INFO] Executing Database Migrations...
call npm run db:migrate
goto END_ACTION

:DEPLOY_PREFLIGHT
echo.
echo [INFO] Executing Deployment Preflight Verification...
call npm run deploy:preflight
goto END_ACTION

:DEPLOY_SMOKE
echo.
echo [INFO] Executing Deployment Smoke Tests...
call npm run deploy:smoke
goto END_ACTION

:BUILD
echo.
echo [INFO] Compiling Next.js Production Bundle...
call npm run build
goto END_ACTION

:SERVICES_UP
echo.
echo [INFO] Starting Docker Compose Development Services...
where docker >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [WARN] Docker is not installed or not available in PATH.
    goto END_ACTION
)
call npm run services:up
goto END_ACTION

:SERVICES_DOWN
echo.
echo [INFO] Stopping Docker Compose Development Services...
where docker >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [WARN] Docker is not installed or not available in PATH.
    goto END_ACTION
)
call npm run services:down
goto END_ACTION

:END_ACTION
echo.
pause
echo.
goto MENU

:EXIT
echo.
echo Goodbye!
exit /b 0
