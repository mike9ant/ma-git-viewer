#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------
# start.sh - Smart startup for Git Repository Viewer
#
# Detects port conflicts, prompts to restart our own services,
# auto-assigns free ports when blocked by foreign processes,
# and starts backend + frontend in one command.
# -----------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEFAULT_BACKEND_PORT=3001
DEFAULT_FRONTEND_PORT=5173
PID_FILE="${TMPDIR:-/tmp}/git-viewer.pid"

BACKEND_PID=""
FRONTEND_PID=""

# ── Cleanup on exit ──────────────────────────────────────────

cleanup() {
    echo ""
    echo "  Shutting down..."
    if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill "$FRONTEND_PID" 2>/dev/null || true
        wait "$FRONTEND_PID" 2>/dev/null || true
    fi
    if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
    fi
    echo "  Stopped."
}

trap cleanup EXIT INT TERM

# ── Helpers ──────────────────────────────────────────────────

# Get PID occupying a port, empty if free
pid_on_port() {
    lsof -ti :"$1" 2>/dev/null | head -1 || true
}

# Check if a port is free
port_is_free() {
    [[ -z "$(pid_on_port "$1")" ]]
}

# Find next free port starting from $1
find_free_port() {
    local port=$1
    while ! port_is_free "$port"; do
        ((port++))
        if (( port > 65535 )); then
            echo "Error: no free port found" >&2
            exit 1
        fi
    done
    echo "$port"
}

# Prompt user yes/no, default no
prompt_yn() {
    local prompt="$1"
    read -rp "$prompt [y/N] " answer
    [[ "$answer" =~ ^[Yy] ]]
}

# ── Backend port resolution ──────────────────────────────────

resolve_backend_port() {
    local port=$DEFAULT_BACKEND_PORT

    # Check PID file first (our app's own record)
    if [[ -f "$PID_FILE" ]]; then
        local stored_pid stored_port
        stored_pid=$(python3 -c "import json,sys; print(json.load(open('$PID_FILE'))['pid'])" 2>/dev/null || true)
        stored_port=$(python3 -c "import json,sys; print(json.load(open('$PID_FILE'))['port'])" 2>/dev/null || true)

        if [[ -n "$stored_pid" ]] && kill -0 "$stored_pid" 2>/dev/null; then
            # Our backend is alive
            echo "  Backend already running (PID $stored_pid) on port $stored_port" >&2
            if prompt_yn "  Restart backend?" </dev/tty; then
                kill "$stored_pid" 2>/dev/null || true
                # Wait for process to exit and port to free
                for _ in $(seq 1 30); do
                    kill -0 "$stored_pid" 2>/dev/null || break
                    sleep 0.1
                done
                port=${stored_port:-$DEFAULT_BACKEND_PORT}
            else
                echo "  Exiting." >&2
                exit 0
            fi
        else
            # Stale PID file
            rm -f "$PID_FILE"
        fi
    fi

    # Check if the chosen port is occupied by a foreign process
    if ! port_is_free "$port"; then
        local occupant
        occupant=$(pid_on_port "$port")
        echo "  Port $port is in use by another process (PID $occupant)." >&2
        port=$(find_free_port $((port + 1)))
        echo "  Using port $port for backend instead." >&2
    fi

    echo "$port"
}

# ── Frontend port resolution ─────────────────────────────────

resolve_frontend_port() {
    local port=$DEFAULT_FRONTEND_PORT

    if ! port_is_free "$port"; then
        local occupant occupant_cmd
        occupant=$(pid_on_port "$port")
        occupant_cmd=$(ps -p "$occupant" -o command= 2>/dev/null || true)

        if [[ "$occupant_cmd" == *"vite"* && "$occupant_cmd" == *"$SCRIPT_DIR"* ]]; then
            # Our frontend is running
            echo "  Frontend already running (PID $occupant) on port $port" >&2
            if prompt_yn "  Restart frontend?" </dev/tty; then
                kill "$occupant" 2>/dev/null || true
                for _ in $(seq 1 30); do
                    kill -0 "$occupant" 2>/dev/null || break
                    sleep 0.1
                done
            else
                echo "  Exiting." >&2
                exit 0
            fi
        else
            # Foreign process
            echo "  Port $port is in use by another process (PID $occupant)." >&2
            port=$(find_free_port $((port + 1)))
            echo "  Using port $port for frontend instead." >&2
        fi
    fi

    echo "$port"
}

# ── Main ─────────────────────────────────────────────────────

REPO_PATH="${1:-$SCRIPT_DIR}"

echo ""
echo "  ┌─────────────────────────────────────────────┐"
echo "  │       Git Repository Viewer - Startup        │"
echo "  └─────────────────────────────────────────────┘"
echo ""

# Resolve ports (stderr used for messages, stdout for the port value)
BACKEND_PORT=$(resolve_backend_port)
FRONTEND_PORT=$(resolve_frontend_port)

echo ""
echo "  Backend:  http://127.0.0.1:$BACKEND_PORT"
echo "  Frontend: http://127.0.0.1:$FRONTEND_PORT"
echo ""

# Start backend in background
echo "  Starting backend..."
cd "$SCRIPT_DIR/backend"
cargo run -- "$REPO_PATH" --port "$BACKEND_PORT" &
BACKEND_PID=$!

# Wait for backend to be ready (up to 30s)
echo "  Waiting for backend..."
for i in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:$BACKEND_PORT/api/v1/repository" >/dev/null 2>&1; then
        echo "  Backend ready."
        break
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "  Error: Backend process exited unexpectedly." >&2
        exit 1
    fi
    if (( i == 60 )); then
        echo "  Warning: Backend did not respond in time, starting frontend anyway." >&2
    fi
    sleep 0.5
done

# Start frontend (foreground — Ctrl+C triggers trap which cleans up both)
echo "  Starting frontend..."
echo ""
cd "$SCRIPT_DIR/frontend"
VITE_BACKEND_PORT="$BACKEND_PORT" npm run dev -- --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

# Wait for both — if either exits, cleanup trap handles the rest
wait "$FRONTEND_PID" 2>/dev/null || true
wait "$BACKEND_PID" 2>/dev/null || true
