#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/pioshin/AI/Projects/P_NOOS/Writers_Nexus/WN_Frontend"
PORT="55099"
URL="http://127.0.0.1:${PORT}"
LOG_FILE="${APP_DIR}/.writers-nexus-server.log"

is_running() {
  ss -ltn "( sport = :${PORT} )" | grep -q ":${PORT}"
}

notify() {
  local msg="$1"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send "Writers Nexus" "$msg"
  fi
  echo "$msg"
}

stop_server() {
  local pids
  pids="$(lsof -ti tcp:${PORT} 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    kill ${pids} || true
    sleep 1
  fi

  if is_running; then
    pids="$(lsof -ti tcp:${PORT} 2>/dev/null || true)"
    if [[ -n "${pids}" ]]; then
      kill -9 ${pids} || true
      sleep 1
    fi
  fi

  if is_running; then
    notify "Non sono riuscito a fermare il server su porta ${PORT}."
    exit 1
  fi

  notify "Server arrestato (porta ${PORT})."
}

start_server() {
  cd "${APP_DIR}"
  nohup npm run start >"${LOG_FILE}" 2>&1 &
  sleep 2

  if is_running; then
    notify "Server avviato su ${URL}"
    xdg-open "${URL}" >/dev/null 2>&1 || true
  else
    notify "Avvio fallito. Controlla log: ${LOG_FILE}"
    exit 1
  fi
}

if is_running; then
  stop_server
else
  start_server
fi
