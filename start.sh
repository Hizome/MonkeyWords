#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v zig >/dev/null 2>&1; then
  echo "[ERROR] zig not found in PATH"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm not found in PATH"
  exit 1
fi

echo "Starting backend (zig build run)..."
(
  cd "${ROOT_DIR}/backend"
  exec zig build run
) &
BACKEND_PID=$!

echo "Starting frontend (npm run dev)..."
(
  cd "${ROOT_DIR}/frontend"
  exec npm run dev
) &
FRONTEND_PID=$!

cleanup() {
  echo
  echo "Stopping services..."
  kill "${BACKEND_PID}" "${FRONTEND_PID}" 2>/dev/null || true
  wait "${BACKEND_PID}" "${FRONTEND_PID}" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

echo "Backend PID: ${BACKEND_PID}"
echo "Frontend PID: ${FRONTEND_PID}"
echo "Press Ctrl+C to stop both services."

wait "${BACKEND_PID}" "${FRONTEND_PID}"
