#!/usr/bin/env bash
set -euo pipefail

# ── Paths ──────────────────────────────────────────────────────
FRONTEND_DIR="/home/pioshin/AI/Projects/P_NOOS/Writers_Nexus/WN_Frontend"
NOOS_DIR="/home/pioshin/AI/Projects/P_NOOS/Writers_Nexus/NOOS"
WORKERS_DIR="/home/pioshin/AI/Projects/P_NOOS/Writers_Nexus/workers"
VENV="/home/pioshin/.venv/workspace"

# ── Ports ──────────────────────────────────────────────────────
FE_PORT="55099"       # live-server  (frontend)
BE_PORT="9090"        # uvicorn      (NOOS Hub backend)

FE_URL="http://127.0.0.1:${FE_PORT}"
BE_URL="http://127.0.0.1:${BE_PORT}"

# ── Logs & PID files ──────────────────────────────────────────
RUN_DIR="${NOOS_DIR}/.run"
mkdir -p "${RUN_DIR}"

FE_LOG="${FRONTEND_DIR}/.writers-nexus-frontend.log"
BE_LOG="${NOOS_DIR}/.writers-nexus-backend.log"
BKA_LOG="${RUN_DIR}/worker-bka.log"
KRONK_LOG="${RUN_DIR}/worker-kronk.log"
BE_PID="${RUN_DIR}/backend.pid"
FE_PID="${RUN_DIR}/frontend.pid"
BKA_PID="${RUN_DIR}/worker-bka.pid"
KRONK_PID="${RUN_DIR}/worker-kronk.pid"

# ── JWT Secret ─────────────────────────────────────────────────
# Persist a unique secret per-machine in .run/jwt_secret.
# Hub reads it via NOOS_JWT_SECRET env var.
JWT_SECRET_FILE="${RUN_DIR}/jwt_secret"
if [[ ! -f "${JWT_SECRET_FILE}" ]]; then
  "${VENV}/bin/python3" -c "import secrets; print(secrets.token_urlsafe(48))" > "${JWT_SECRET_FILE}"
  chmod 600 "${JWT_SECRET_FILE}"
fi
JWT_SECRET="$(<"${JWT_SECRET_FILE}")"
export NOOS_JWT_SECRET="${JWT_SECRET}"

# Worker JWT token (scopes: jobs:poll, jobs:report, llm:chat, llm:complete)
WORKER_TOKEN="${NOOS_WORKER_TOKEN:-$("${VENV}/bin/python3" -c "from jose import jwt; print(jwt.encode({'sub':'worker','scopes':['jobs:poll','jobs:report','llm:chat','llm:complete'],'iss':'noos','aud':'noos'}, '${JWT_SECRET}', algorithm='HS256'))" 2>/dev/null || echo '')}"

# IODA JWT token (scopes: llm:policy) — used to push initial routing policy
IODA_TOKEN="${NOOS_IODA_TOKEN:-$("${VENV}/bin/python3" -c "from jose import jwt; print(jwt.encode({'sub':'ioda','scopes':['llm:policy','llm:chat','llm:complete'],'iss':'noos','aud':'noos'}, '${JWT_SECRET}', algorithm='HS256'))" 2>/dev/null || echo '')}"

# Frontend JWT token (scopes: jobs:create, jobs:read, jobs:cancel, events:listen)
FRONTEND_TOKEN="${NOOS_FRONTEND_TOKEN:-$("${VENV}/bin/python3" -c "from jose import jwt; print(jwt.encode({'sub':'frontend','scopes':['jobs:create','jobs:read','jobs:cancel','events:listen'],'iss':'noos','aud':'noos'}, '${JWT_SECRET}', algorithm='HS256'))" 2>/dev/null || echo '')}"

# ── Helpers ────────────────────────────────────────────────────

port_listening() {
  ss -ltn "( sport = :$1 )" 2>/dev/null | grep -q ":$1"
}

# Check if a PID file exists and its process is alive
pid_alive() {
  local pidfile="$1"
  [[ -f "${pidfile}" ]] || return 1
  local pid
  pid="$(<"${pidfile}")"
  [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null
}

notify() {
  local msg="$1"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send "Writers Nexus" "$msg"
  fi
  echo "$msg"
}

# Gracefully stop a service by its PID file, with port fallback
stop_service() {
  local pidfile="$1" port="$2" label="$3"
  local pid=""

  # 1) Try PID file first (safe — only kills what we started)
  if [[ -f "${pidfile}" ]]; then
    pid="$(<"${pidfile}")"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      # Wait up to 3 s for graceful shutdown
      local i=0
      while (( i < 6 )) && kill -0 "${pid}" 2>/dev/null; do
        sleep 0.5; (( i++ )) || true
      done
      # Force-kill if still alive
      if kill -0 "${pid}" 2>/dev/null; then
        kill -9 "${pid}" 2>/dev/null || true
        sleep 0.5
      fi
    fi
    rm -f "${pidfile}"
  fi

  # 2) Fallback: if port still occupied, kill by port (handles stale PID)
  if port_listening "${port}"; then
    local pids
    pids="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"
    if [[ -n "${pids}" ]]; then
      kill ${pids} 2>/dev/null || true
      sleep 1
      # Force-kill
      if port_listening "${port}"; then
        pids="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"
        [[ -n "${pids}" ]] && kill -9 ${pids} 2>/dev/null || true
        sleep 0.5
      fi
    fi
  fi
}

# ── Service running? ──────────────────────────────────────────
# A service counts as "ours" if the PID file is alive OR the port is up
service_running() {
  local pidfile="$1" port="$2"
  pid_alive "${pidfile}" || port_listening "${port}"
}

# ── Stop ───────────────────────────────────────────────────────

stop_worker() {
  local pidfile="$1" label="$2"
  if [[ -f "${pidfile}" ]]; then
    local pid
    pid="$(<"${pidfile}")"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      local i=0
      while (( i < 6 )) && kill -0 "${pid}" 2>/dev/null; do
        sleep 0.5; (( i++ )) || true
      done
      kill -0 "${pid}" 2>/dev/null && kill -9 "${pid}" 2>/dev/null || true
    fi
    rm -f "${pidfile}"
    echo "Worker ${label} fermato."
  fi
}

stop_all() {
  # Stop workers first (they depend on backend)
  stop_worker "${BKA_PID}" "BKA"
  stop_worker "${KRONK_PID}" "KRONK"

  stop_service "${BE_PID}" "${BE_PORT}" "backend"
  stop_service "${FE_PID}" "${FE_PORT}" "frontend"

  local ok=true
  if port_listening "${BE_PORT}"; then
    notify "Non riesco a fermare il backend (porta ${BE_PORT})."
    ok=false
  fi
  if port_listening "${FE_PORT}"; then
    notify "Non riesco a fermare il frontend (porta ${FE_PORT})."
    ok=false
  fi
  if $ok; then
    notify "Writers Nexus arrestato (frontend :${FE_PORT}, backend :${BE_PORT}, workers)."
  fi
}

# ── Start ──────────────────────────────────────────────────────

start_all() {
  # 0) Ensure Ollama is running (needed by NOOS LLM gateway)
  if pgrep -x ollama >/dev/null 2>&1; then
    echo "Ollama già attivo, skip."
  else
    echo "Avvio Ollama..."
    setsid ollama serve >>"${RUN_DIR}/ollama.log" 2>&1 &
    # Wait up to 8 s for Ollama to respond
    local olla_tries=0
    while ! curl -sf http://127.0.0.1:11434/api/version >/dev/null 2>&1 && (( olla_tries < 16 )); do
      sleep 0.5
      (( olla_tries++ )) || true
    done
    if curl -sf http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
      echo "Ollama avviato su http://127.0.0.1:11434"
    else
      notify "⚠ Ollama non si avvia. LLM gateway non funzionerà."
    fi
  fi

  # 1) Start NOOS Hub backend (uvicorn)
  #    setsid creates a new session so the process survives terminal close
  if service_running "${BE_PID}" "${BE_PORT}"; then
    echo "Backend già attivo su :${BE_PORT}, skip."
  else
    cd "${NOOS_DIR}"
    setsid "${VENV}/bin/uvicorn" noos.main:app \
      --host 127.0.0.1 --port "${BE_PORT}" \
      >>"${BE_LOG}" 2>&1 &
    echo $! > "${BE_PID}"

    # Wait for backend to be ready (max 10 s)
    local tries=0
    while ! port_listening "${BE_PORT}" && (( tries < 20 )); do
      sleep 0.5
      (( tries++ )) || true
    done
    if port_listening "${BE_PORT}"; then
      echo "Backend NOOS avviato su ${BE_URL}"
    else
      rm -f "${BE_PID}"
      notify "Avvio backend fallito. Controlla: ${BE_LOG}"
      exit 1
    fi
  fi

  # 1b) Push IODA routing policy — auto-detect Ollama model
  local ACTIVE_MODEL
  ACTIVE_MODEL=$(curl -sf http://127.0.0.1:11434/api/tags | "${VENV}/bin/python3" -c "
import sys, json
try:
    models = json.load(sys.stdin)['models']
    print(models[0]['name'] if models else 'gpt-oss:latest')
except Exception:
    print('gpt-oss:latest')
" 2>/dev/null || echo 'gpt-oss:latest')

  # 1c) VRAM offloading check — warn if model is partially offloaded to CPU
  "${VENV}/bin/python3" -c "
import sys, json, urllib.request
try:
    data = json.loads(urllib.request.urlopen('http://127.0.0.1:11434/api/ps', timeout=3).read())
    for m in data.get('models', []):
        total = m.get('size', 0)
        vram  = m.get('size_vram', 0)
        if total > 0 and vram < total:
            offloaded_pct = round((1 - vram / total) * 100)
            offloaded_gb  = round((total - vram) / (1024**3), 1)
            name = m.get('name', '?')
            if offloaded_pct >= 10:
                print(f'\033[33m⚠ ATTENZIONE: {name} ha {offloaded_gb} GB offloaded su CPU ({offloaded_pct}%)');
                print(f'  I job LLM saranno MOLTO lenti. Considera un modello più piccolo o con quant più aggressiva.\033[0m')
except Exception:
    pass
" 2>/dev/null

  if [ -n "${IODA_TOKEN}" ]; then
    curl -sf -X PUT "${BE_URL}/v1/llm/policy" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${IODA_TOKEN}" \
      -d "{\"routingPolicy\":{\"default\":\"${ACTIVE_MODEL}\"},\"concurrencyLimits\":{\"maxConcurrentOllama\":1}}" \
      >/dev/null 2>&1 && echo "IODA policy pushata — model=${ACTIVE_MODEL}" \
      || echo "⚠ Push IODA policy fallita (non bloccante)"
  fi

  # 2) Start frontend (live-server)
  if service_running "${FE_PID}" "${FE_PORT}"; then
    echo "Frontend già attivo su :${FE_PORT}, skip."
  else
    cd "${FRONTEND_DIR}"
    setsid npx live-server --host=127.0.0.1 --port="${FE_PORT}" \
      >>"${FE_LOG}" 2>&1 &
    echo $! > "${FE_PID}"

    local fe_tries=0
    while ! port_listening "${FE_PORT}" && (( fe_tries < 10 )); do
      sleep 0.5
      (( fe_tries++ )) || true
    done
    if port_listening "${FE_PORT}"; then
      echo "Frontend avviato su ${FE_URL}"
    else
      rm -f "${FE_PID}"
      notify "Avvio frontend fallito. Controlla: ${FE_LOG}"
      exit 1
    fi
  fi

  # 3) Start Worker BKA (analysis engine)
  if pid_alive "${BKA_PID}"; then
    echo "Worker BKA già attivo, skip."
  else
    cd "${WORKERS_DIR}"
    NOOS_WORKER_TOKEN="${WORKER_TOKEN}" \
    setsid "${VENV}/bin/python3" -m bka.main \
      >>"${BKA_LOG}" 2>&1 &
    echo $! > "${BKA_PID}"
    echo "Worker BKA avviato (PID $(cat "${BKA_PID}"))"
  fi

  # 4) Start Worker KRONK (writing engine)
  if pid_alive "${KRONK_PID}"; then
    echo "Worker KRONK già attivo, skip."
  else
    cd "${WORKERS_DIR}"
    NOOS_WORKER_TOKEN="${WORKER_TOKEN}" \
    setsid "${VENV}/bin/python3" -m kronk.main \
      >>"${KRONK_LOG}" 2>&1 &
    echo $! > "${KRONK_PID}"
    echo "Worker KRONK avviato (PID $(cat "${KRONK_PID}"))"
  fi

  notify "Writers Nexus avviato ✓  Frontend: ${FE_URL}  Backend: ${BE_URL}  Workers: BKA+KRONK"

  # Write frontend token to a file the HubClient can read via fetch at startup
  echo "${FRONTEND_TOKEN}" > "${RUN_DIR}/frontend_token"
  chmod 600 "${RUN_DIR}/frontend_token"
  echo "Frontend token salvato in ${RUN_DIR}/frontend_token"

  setsid xdg-open "${FE_URL}" >/dev/null 2>&1 &
}

# ── Toggle ─────────────────────────────────────────────────────

if service_running "${BE_PID}" "${BE_PORT}" || service_running "${FE_PID}" "${FE_PORT}"; then
  stop_all
else
  start_all
fi
