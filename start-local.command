#!/bin/bash
# Starts Nimbus in local-only mode: production build served by the Express API,
# answering from a model running on this machine via Ollama.
#
# No cloud provider is configured or contacted. If you want the hosted NVIDIA
# models later, change LLM_PROVIDER in .env, not here.
#
# Run it by double-clicking, or: ./start-local.command
set -euo pipefail
cd "$(dirname "$0")"

# Local only, regardless of what is set in .env.
export LLM_PROVIDER=ollama
export OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.2:latest}"
export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434/v1}"
export PORT="${PORT:-3001}"
export NODE_ENV=production

echo "Nimbus — local mode"
echo "  provider : ollama (local, no cloud)"
echo "  model    : $OLLAMA_MODEL"
echo "  url      : http://127.0.0.1:$PORT"
echo

if ! curl -s -m 3 "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
  echo "Ollama is not responding on 127.0.0.1:11434."
  echo "Start it with:  ollama serve"
  echo "Then run this script again."
  exit 1
fi

if [ ! -f dist/index.html ]; then
  echo "Building the UI (first run, takes a few seconds)…"
  npm run build
fi

# Open the browser as soon as the API answers.
(
  for _ in $(seq 1 40); do
    if curl -s -m 1 -o /dev/null "http://127.0.0.1:$PORT/api/health" 2>/dev/null; then
      open "http://127.0.0.1:$PORT"
      break
    fi
    sleep 0.5
  done
) &

echo "Starting server. Close this window or press Ctrl-C to stop."
exec node server/index.js
