@echo off
setlocal
title Manager 24/7 by PARADIM - Build APK
cd /d "%~dp0"

rem Arhiva este livrata fara repository Git; EAS poate construi direct din sursa locala.
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

echo [4/4] Generez APK-ul arm64 stabil semnat Manager 24/7 1.4.8...
rem --non-interactive opreste intrebarea "Install and run on an emulator?".
rem Fara Android Studio instalat, un raspuns "yes" acolo opreste scriptul cu
rem "spawn adb ENOENT", desi APK-ul este deja construit si gata de descarcat.
call npx --yes eas-cli@latest build --platform android --profile production-apk --non-interactive --clear-cache
if errorlevel 1 goto :failed

:build_ok

echo.
echo ==========================================================
echo  APK-ul este gata.
echo.
echo  Deschide linkul afisat mai sus (Build details) si apasa
echo  "Install" ca sa descarci fisierul .apk, sau scaneaza
echo  codul QR direct cu telefonul Android.
echo.
echo  Redenumeste fisierul in manager24-7.apk si
echo  urca-l la https://app.paradim.ro/manager24-7.apk
echo.
echo  Pentru codul din email, aplica si configurarile din
echo  LOGIN-OTP-0.2.0.md. Versiunea accepta codurile live de 6-10 cifre.
echo ==========================================================
echo.
pause
exit /b 0

:failed
echo.
echo Procesul s-a oprit. Daca a aparut un link Build details, trimite-l pentru verificare.
echo Daca oprirea a fost la teste, trimite captura completa a erorii.
echo Daca s-a consumat cota EAS, ruleaza BUILD-APK-LOCAL-WINDOWS.bat.
pause
exit /b 1
