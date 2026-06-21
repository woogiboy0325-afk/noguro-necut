@echo off
title 놀구로 네컷 - 키오스크 시작

echo [1/2] 인쇄 서버 의존성 설치 중...
cd /d "%~dp0print-server"
if not exist node_modules (
    call npm install
)

echo [2/2] 인쇄 서버 시작 중...
start "놀구로 인쇄 서버" cmd /k "node server.js"

echo.
echo 인쇄 서버가 시작됐습니다.
echo 이제 웹 앱을 실행하거나 브라우저를 여세요.
echo.
pause
