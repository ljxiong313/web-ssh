@echo off
setlocal EnableDelayedExpansion

set "RootDir=%~dp0"
set "RootDir=%RootDir:~0,-1%"
set "OutDir=%RootDir%\output"

REM Detect volta
where volta >nul 2>&1 || (
    echo Error: volta not found. Please install volta.
    exit /b 1
)
echo Using volta for frontend build

REM ========== Backend ==========
echo.
echo === Building backend ===
set "_out=%OutDir%\webssh-backend.exe"
set "_dir=%RootDir%\backend"
for %%D in ("%_out%") do if not exist "%%~dpD" mkdir "%%~dpD"
pushd "%_dir%"
echo   go build -o "%_out%"
go build -o "%_out%" .
if errorlevel 1 (
    popd
    exit /b 1
)
echo   Backend built -^> %_out%
popd

REM ========== Frontend ==========
echo.
echo === Building frontend ===
set "_out=%OutDir%\frontend"
echo   volta run npm run build
pushd "%RootDir%"
volta run npm run build
if errorlevel 1 (
    popd
    echo Frontend build failed
    exit /b 1
)
if exist "%_out%" rmdir /s /q "%_out%"
mkdir "%_out%"
xcopy /s /e /i /q "%RootDir%\dist\*" "%_out%" >nul
echo   Frontend built -^> %_out%
popd

echo.
echo Build complete. Artifacts in: %OutDir%
