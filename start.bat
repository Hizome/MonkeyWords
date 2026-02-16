@echo off
echo Starting Backend...
start cmd /k "cd backend && zig build run"

echo Starting Frontend...
start cmd /k "cd frontend && npm run dev"

echo Both services are starting in separate windows.
pause
