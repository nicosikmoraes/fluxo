@echo off
title Fluxo - servidor local
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Nao foi possivel encontrar o Node.js. Instale o Node.js para abrir o Fluxo.
  pause
  exit /b 1
)
node start.cjs
if errorlevel 1 (
  echo.
  echo O Fluxo nao iniciou. Confira o erro acima.
  pause
)
