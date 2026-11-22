@echo off
rem Uruchamia RetroFootball: instaluje zaleznosci (za pierwszym razem) i startuje serwer gry.
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

if not exist node_modules (
  echo Instaluje zaleznosci...
  call npm install
)

echo Startuje gre na http://localhost:3000 ...
echo (zamknij to okno, aby zatrzymac gre)
call npm run dev
pause
