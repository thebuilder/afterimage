#!/usr/bin/env bash
# Capture the hero for each effect id, in order, from a running dev server.
set -e
S=sl
URL=${URL:-http://localhost:5177}
agent-browser --session $S --webgpu open "$URL" >/dev/null
sleep 4
i=1
for id in "$@"; do
  agent-browser --session $S eval "window.dispatchEvent(new KeyboardEvent('keydown',{key:'$((i==10?0:i))'})); 'ok'" >/dev/null
  sleep 5
  agent-browser --session $S screenshot "out/shot-$id.png" >/dev/null
  echo "captured $id"
  i=$((i+1))
done
