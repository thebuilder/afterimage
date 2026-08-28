#!/usr/bin/env bash
# `vgpu check` takes one entry at a time, so walk every shader and fail loudly.
set -u
fail=0
count=0
for f in src/shaders/*.wgsl src/effects/*/*.wgsl; do
  count=$((count + 1))
  if out=$(npx --no-install vgpu check "$f" 2>&1); then
    if ! printf '%s' "$out" | grep -q '"ok": true'; then
      echo "NOT VALIDATED  $f"
      fail=$((fail + 1))
    fi
  else
    echo "FAIL           $f"
    printf '%s\n' "$out" | tail -20
    fail=$((fail + 1))
  fi
done
echo "$count shaders checked, $fail failing"
exit $((fail > 0))
