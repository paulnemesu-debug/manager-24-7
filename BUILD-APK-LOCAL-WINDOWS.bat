@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Manager 24/7 by PARADIM - Build APK local
cd /d "%~dp0"

set "APP_VERSION=1.6.2"
set "APK_OUTPUT=manager24-7-v1.6.2-local.apk"
set "NODE_ENV=production"
if not defined SENTRY_AUTH_TOKEN set "SENTRY_DISABLE_AUTO_UPLOAD=true"
set "EXPO_PUBLIC_SUPABASE_URL=https://mnaaibsmijziutxuluvv.supabase.co"
set "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_FUZ97amKl15vIFXyjyfeaQ_kXLiknqY"
set "EXPO_PUBLIC_GOOGLE_PLAY_SUBSCRIPTION_ID=professional_foodcost_pro"
set "EXPO_PUBLIC_DISTRIBUTION_CHANNEL=direct"
set "EXPO_PUBLIC_DEMO_MODE=false"
set "GRADLE_OPTS=-Dorg.gradle.parallel=false -Dorg.gradle.daemon=false -Dorg.gradle.workers.max=1"
set "CMAKE_BUILD_PARALLEL_LEVEL=1"

echo ==========================================================
echo  Manager 24/7 %APP_VERSION% - build APK local, fara Expo
echo ==========================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo EROARE: Node.js nu este instalat sau nu este in PATH.
  echo Instaleaza Node.js LTS si ruleaza din nou acest fisier.
  goto :failed
)

rem JDK 25 din Android Studio poate bloca Prefab; acest proiect foloseste JDK 17.
set "FOUND_JAVA17="
call :try_java17 "%JAVA_HOME%"
if defined FOUND_JAVA17 goto :java_found
for /d %%J in ("%ProgramFiles%\Eclipse Adoptium\jdk-17*" "%ProgramFiles%\Microsoft\jdk-17*" "%~dp0..\jdk17\jdk-17*") do (
  call :try_java17 "%%~J"
  if defined FOUND_JAVA17 goto :java_found
)
call :try_java17 "%ProgramFiles%\Android\Android Studio\jbr"
if defined FOUND_JAVA17 goto :java_found
call :try_java17 "%LOCALAPPDATA%\Programs\Android Studio\jbr"
if defined FOUND_JAVA17 goto :java_found
echo EROARE: Este necesar un JDK 17 complet. Instaleaza Temurin 17 sau Microsoft OpenJDK 17.
echo Seteaza JAVA_HOME catre folderul JDK 17 si ruleaza din nou acest fisier.
goto :failed

:java_found

rem Buildul cere compilatorul dintr-un JDK complet, nu numai runtime Java.
if not exist "!JAVA_HOME!\bin\javac.exe" (
  echo EROARE: Java gasit este numai un runtime; lipseste compilatorul javac.
  echo Foloseste JDK-ul complet din Android Studio sau seteaza JAVA_HOME catre un JDK.
  goto :failed
)

rem Android Studio instaleaza implicit SDK-ul in acest folder.
if defined ANDROID_SDK_ROOT if exist "!ANDROID_SDK_ROOT!\platform-tools" goto :sdk_found
if defined ANDROID_HOME if exist "!ANDROID_HOME!\platform-tools" (
  set "ANDROID_SDK_ROOT=!ANDROID_HOME!"
  goto :sdk_found
)
if exist "%LOCALAPPDATA%\Android\Sdk" (
  set "ANDROID_SDK_ROOT=%LOCALAPPDATA%\Android\Sdk"
  goto :sdk_found
)
echo EROARE: Android SDK nu a fost gasit.
echo In Android Studio deschide More Actions ^> SDK Manager si instaleaza SDK-ul.
goto :failed

:sdk_found
set "ANDROID_HOME=!ANDROID_SDK_ROOT!"
set "PATH=!JAVA_HOME!\bin;!ANDROID_SDK_ROOT!\platform-tools;!PATH!"
echo Java: !JAVA_HOME!
echo Android SDK: !ANDROID_SDK_ROOT!
echo.

set "SDKMANAGER="
if exist "!ANDROID_SDK_ROOT!\cmdline-tools\latest\bin\sdkmanager.bat" set "SDKMANAGER=!ANDROID_SDK_ROOT!\cmdline-tools\latest\bin\sdkmanager.bat"
if not defined SDKMANAGER (
  for /f "delims=" %%D in ('dir /b /ad /o-n "!ANDROID_SDK_ROOT!\cmdline-tools" 2^>nul') do (
    if not defined SDKMANAGER if exist "!ANDROID_SDK_ROOT!\cmdline-tools\%%D\bin\sdkmanager.bat" set "SDKMANAGER=!ANDROID_SDK_ROOT!\cmdline-tools\%%D\bin\sdkmanager.bat"
  )
)

set "SDK_MISSING=0"
if not exist "!ANDROID_SDK_ROOT!\platforms\android-36\android.jar" set "SDK_MISSING=1"
if not exist "!ANDROID_SDK_ROOT!\build-tools\36.0.0" set "SDK_MISSING=1"
if not exist "!ANDROID_SDK_ROOT!\ndk\27.1.12297006" set "SDK_MISSING=1"

if "!SDK_MISSING!"=="1" (
  if not defined SDKMANAGER (
    echo EROARE: Lipsesc componente SDK si nu gasesc sdkmanager.bat.
    echo In SDK Manager instaleaza Platform 36, Build-Tools 36.0.0,
    echo Platform-Tools, Command-line Tools si NDK 27.1.12297006.
    goto :failed
  )
  echo Lipsesc unele componente Android. Pornesc instalarea oficiala...
  echo Accepta licentele cu y atunci cand sunt afisate.
  call "!SDKMANAGER!" --sdk_root="!ANDROID_SDK_ROOT!" --licenses
  if errorlevel 1 goto :sdk_failed
  call "!SDKMANAGER!" --sdk_root="!ANDROID_SDK_ROOT!" "platform-tools" "platforms;android-36" "build-tools;36.0.0" "cmdline-tools;latest" "ndk;27.1.12297006"
  if errorlevel 1 goto :sdk_failed
)

if not exist "!ANDROID_SDK_ROOT!\platforms\android-36\android.jar" goto :sdk_failed
if not exist "!ANDROID_SDK_ROOT!\build-tools\36.0.0" goto :sdk_failed
if not exist "!ANDROID_SDK_ROOT!\ndk\27.1.12297006" goto :sdk_failed

set "SDK_GRADLE=!ANDROID_SDK_ROOT:\=/!"
>"android\local.properties" echo sdk.dir=!SDK_GRADLE!

if not exist "android\keystore.properties" if not exist "android\app\debug.keystore" (
  echo Generez cheia locala de test pentru acest calculator...
  call "!JAVA_HOME!\bin\keytool.exe" -genkeypair -v -storetype JKS -keystore "android\app\debug.keystore" -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug, OU=Android, O=Unknown, L=Unknown, ST=Unknown, C=US"
  if errorlevel 1 goto :failed
)

echo [1/4] Instalez dependentele proiectului...
call npm ci --include=dev --no-audit --no-fund
if errorlevel 1 goto :failed

echo [2/4] Verific TypeScript, testele si lint...
call npm run typecheck
if errorlevel 1 goto :failed
call npm test
if errorlevel 1 goto :failed
call npm run lint
if errorlevel 1 goto :failed

if exist "android\keystore.properties" (
  echo [3/4] Semnare: cheia configurata in android\keystore.properties.
) else (
  echo [3/4] Semnare: cheia locala de test.
  echo ATENTIE: daca telefonul are versiunea semnata de Expo, Android poate cere
  echo dezinstalarea acelei versiuni inainte de instalarea APK-ului local.
)

echo [4/4] Generez APK-ul release arm64 cu R8/ProGuard. Prima rulare descarca si pregateste dependentele native...
pushd android
call gradlew.bat app:assembleRelease --no-daemon --max-workers=1 -Pkotlin.compiler.execution.strategy=in-process -PreactNativeArchitectures=arm64-v8a
set "GRADLE_EXIT=!ERRORLEVEL!"
popd
if not "!GRADLE_EXIT!"=="0" goto :failed

if not exist "android\app\build\outputs\apk\release\app-release.apk" (
  echo EROARE: Gradle s-a terminat, dar APK-ul nu a fost gasit.
  goto :failed
)

copy /Y "android\app\build\outputs\apk\release\app-release.apk" "%APK_OUTPUT%" >nul
if errorlevel 1 goto :failed

echo.
echo ==========================================================
echo  APK GENERAT CU SUCCES:
echo  %CD%\%APK_OUTPUT%
echo.
echo  Copiaza acest fisier pe telefon si instaleaza-l.
echo  Scriptul NU dezinstaleaza automat aplicatia existenta.
echo ==========================================================
echo.
pause
exit /b 0

:sdk_failed
echo.
echo EROARE: Componentele Android SDK nu au putut fi instalate.
echo Deschide Android Studio ^> More Actions ^> SDK Manager si instaleaza manual:
echo Platform 36, Build-Tools 36.0.0, Platform-Tools si NDK 27.1.12297006.
goto :failed

:try_java17
if "%~1"=="" exit /b 0
if not exist "%~1\bin\javac.exe" exit /b 0
if not exist "%~1\release" exit /b 0
findstr /R /B /C:"JAVA_VERSION=.17[.]" "%~1\release" >nul 2>&1
if errorlevel 1 exit /b 0
set "JAVA_HOME=%~1"
set "FOUND_JAVA17=1"
exit /b 0

:failed
echo.
echo Buildul local s-a oprit. Trimite o captura cu primele randuri rosii ale erorii.
pause
exit /b 1

