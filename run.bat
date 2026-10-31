@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

title VerityScout AI — Management ^& Launch Console

echo ===============================================================================
echo                           VERITYSCOUT AI
echo     Autonomous Multi-Source Web Research ^& Deterministic Verification
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
    echo Installing project dependencies...
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
echo Select an action:
echo -------------------------------------------------------------------------------
echo  [1] Start Development Server (npm run dev)
echo  [2] Run Full Verification (Typecheck + Lint + Unit Tests + Build)
echo  [3] Run Unit ^& Component Tests (npm run test)
echo  [4] Run Playwright End-to-End Tests (npm run test:e2e)
echo  [5] Build Production Bundle (npm run build)
echo  [6] Start Production Server (npm run start)
echo  [7] Start Local Services (Docker Compose - PostgreSQL ^& Redis)
echo  [8] Stop Local Services (Docker Compose)
echo  [9] Exit
echo -------------------------------------------------------------------------------
set "CHOICE=1"
set /p "CHOICE=Enter choice (1-9) [Default: 1]: "

if "%CHOICE%"=="1" goto DEV
if "%CHOICE%"=="2" goto VERIFY
if "%CHOICE%"=="3" goto TEST
if "%CHOICE%"=="4" goto E2E
if "%CHOICE%"=="5" goto BUILD
if "%CHOICE%"=="6" goto START
if "%CHOICE%"=="7" goto SERVICES_UP
if "%CHOICE%"=="8" goto SERVICES_DOWN
if "%CHOICE%"=="9" goto EXIT

echo [WARN] Invalid choice. Please select 1 through 9.
echo.
goto MENU

:DEV
echo.
echo [INFO] Starting Next.js Development Server at http://localhost:3000 ...
echo [INFO] Opening default browser at http://localhost:3000 ...
start http://localhost:3000
echo Press Ctrl+C in this terminal to stop the server.
echo.
call npm run dev
goto MENU

:VERIFY
echo.
echo [INFO] Running full static and automated verification sequence...
echo.
echo 1/4 - Running TypeScript strict typecheck...
call npm run typecheck
if %ERRORLEVEL% neq 0 (
    echo [FAIL] Typecheck failed.
    goto END_ACTION
)
echo.
echo 2/4 - Running ESLint 9 checks...
call npm run lint
if %ERRORLEVEL% neq 0 (
    echo [FAIL] Lint failed.
    goto END_ACTION
)
echo.
echo 3/4 - Running Vitest unit ^& component test suite...
call npm run test
if %ERRORLEVEL% neq 0 (
    echo [FAIL] Unit tests failed.
    goto END_ACTION
)
echo.
echo 4/4 - Running Next.js production build...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [FAIL] Production build failed.
    goto END_ACTION
)
echo.
echo ===============================================================================
echo [SUCCESS] All verification stages passed with 0 errors!
echo ===============================================================================
goto END_ACTION

:TEST
echo.
echo [INFO] Executing Vitest test suite...
call npm run test
goto END_ACTION

:E2E
echo.
echo [INFO] Executing Playwright E2E browser tests (Chromium)...
call npm run test:e2e
goto END_ACTION

:BUILD
echo.
echo [INFO] Compiling production Next.js application...
call npm run build
goto END_ACTION

:START
echo.
echo [INFO] Starting production Next.js server at http://localhost:3000 ...
start http://localhost:3000
call npm run start
goto MENU

:SERVICES_UP
echo.
echo [INFO] Checking Docker availability...
where docker >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [WARN] Docker is not installed or not available in PATH.
    echo Docker is optional during Phase 2 foundation work.
    echo Local PostgreSQL and Redis services will be used starting in Phase 6.
    goto END_ACTION
)
echo [INFO] Starting development services via Docker Compose...
call npm run services:up
goto END_ACTION

:SERVICES_DOWN
echo.
where docker >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [WARN] Docker is not installed or not available in PATH.
    goto END_ACTION
)
echo [INFO] Stopping development services via Docker Compose...
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
