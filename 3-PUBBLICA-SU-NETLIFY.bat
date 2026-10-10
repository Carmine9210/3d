@echo off
chcp 65001 >nul
title Pubblica 3D Market su Netlify
cd /d "%~dp0sito"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js non e' installato. Si apre la pagina di download: installa la versione LTS, poi fai di nuovo doppio clic qui.
  start https://nodejs.org/it/download
  pause
  exit /b 1
)
node scripts\pubblica.mjs
echo.
pause
