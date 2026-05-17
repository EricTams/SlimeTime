@echo off
setlocal

cd /d "%~dp0"

if not exist node_modules (
  echo Installing npm dependencies...
  call npm install
  if errorlevel 1 exit /b %errorlevel%
)

echo Installing Playwright Chromium if needed...
call npx playwright install chromium
if errorlevel 1 exit /b %errorlevel%

echo Running TypeScript checks...
call npm run typecheck
if errorlevel 1 exit /b %errorlevel%

echo Running unit tests...
call npm run test
if errorlevel 1 exit /b %errorlevel%

echo Running coverage...
call npm run test:coverage
if errorlevel 1 exit /b %errorlevel%

echo Building production bundle...
call npm run build
if errorlevel 1 exit /b %errorlevel%

echo Running browser smoke tests...
call npm run test:e2e
if errorlevel 1 exit /b %errorlevel%

echo All local checks passed.
