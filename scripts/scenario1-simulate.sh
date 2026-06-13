#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/cre-workflow"

echo "Running Scenario 1: local CRE callback simulation"
go test ./...
cre workflow simulate . --target staging-settings --non-interactive \
  --trigger-index 0 --http-payload ./simulation/callback-payload.json
