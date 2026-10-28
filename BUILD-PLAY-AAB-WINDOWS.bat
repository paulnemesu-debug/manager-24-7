@echo off
setlocal
title Manager 24/7 by PARADIM - Build Google Play AAB
cd /d "%~dp0"

set "EAS_NO_VCS=1"
set "EAS_PROJECT_ROOT=%CD%"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js nu este instalat. Instaleaza versiunea LTS de pe https://nodejs.org/ si ruleaza din nou acest fisier.
  pause
  exit /b 1
)

echo [1/4] Instalez versiunile verificate din package-lock.json...
call npm ci --include=dev --no-audit --no-fund
if errorlevel 1 goto :failed

echo [2/4] Verific sursele si testele...
call npm run typecheck
if errorlevel 1 goto :failed
call npm test
if errorlevel 1 goto :failed
call npm run lint
if errorlevel 1 goto :failed

echo [3/4] Verific autentificarea Expo...
call npx --yes eas-cli@latest whoami
if errorlevel 1 (
  call npx --yes eas-cli@latest login
  if errorlevel 1 goto :failed
)

echo [4/4] Generez AAB-ul arm64 stabil pentru Google Play...
call npx --yes eas-cli@latest build --platform android --profile production --non-interactive --clear-cache
if not errorlevel 1 goto :build_ok

echo.
echo Workerul Expo s-a intrerupt. Reincerc automat buildul o singura data...
call npx --yes eas-cli@latest build --platform android --profile production --non-interactive --clear-cache
if errorlevel 1 goto :failed

:build_ok
echo.
echo ==========================================================
echo  AAB-ul este gata pentru Internal testing in Google Play.
echo  Deschide Build details, descarca fisierul .aab si urca-l
echo  in Play Console. Acest build NU afiseaza plata externa.
echo ==========================================================
echo.
pause
exit /b 0

:failed
echo.
echo Procesul s-a oprit. Daca a aparut un link Build details, trimite-l pentru verificare.
echo Daca oprirea a fost la teste, trimite captura completa a erorii.
pause
exit /b 1
