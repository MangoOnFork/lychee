@echo off
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing dependencies...
  call npm install
  node node_modules\electron\install.js
)
start "" "node_modules\electron\dist\electron.exe" .
