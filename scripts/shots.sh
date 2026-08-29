#!/usr/bin/env bash
# Capture the hero for each effect id from a running dev server.
#
# Selection is by URL (`/<id>`), not by number key: the keyboard shortcuts index
# the registry positionally, which silently mislabels every shot the moment the
# registry is reordered, and only reaches the first ten effects at all.
#
# With no arguments, captures every id in the registry.
set -euo pipefail

S=shots
URL=${URL:-http://localhost:5177}
here=$(cd "$(dirname "$0")" && pwd)

command -v agent-browser >/dev/null || {
  echo "shots.sh needs the agent-browser CLI on PATH" >&2
  exit 1
}

curl -sf -o /dev/null "$URL" || {
  echo "no dev server at $URL (npm run dev)" >&2
  exit 1
}

if [ "$#" -gt 0 ]; then
  ids=("$@")
else
  # shellcheck disable=SC2207
  ids=($(node -e "import('$here/lib/registry.mjs').then(m => console.log(m.parseEffects().map(e => e.id).join(' ')))"))
fi

mkdir -p out

for id in "${ids[@]}"; do
  agent-browser --session $S --webgpu open "$URL/$id" >/dev/null
  sleep 5
  agent-browser --session $S screenshot "out/shot-$id.png" >/dev/null
  echo "captured $id"
done

agent-browser --session $S close >/dev/null
