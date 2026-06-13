#!/usr/bin/env bash
set -euo pipefail

# Scenario 2: Chainlink Confidential AI Attester end-to-end demo
# Terminal 1: cre workflow simulate cre-workflow --broadcast --non-interactive
# Terminal 2: run this script after ngrok http 2000

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${INFERENCE_API_KEY:-}" ]]; then
  echo "Export INFERENCE_API_KEY from .env.local"
  exit 1
fi

if [[ -z "${CRE_CALLBACK_URL:-}" ]]; then
  echo "Export CRE_CALLBACK_URL=https://<ngrok>.ngrok-free.dev/trigger"
  exit 1
fi

BASE_URL="${CHAINLINK_ATTESTER_URL:-https://confidential-ai-dev-preview.cldev.cloud}"
FIXTURE="${ROOT}/cre-workflow/simulation/sample-bank.pdf"

if [[ ! -f "$FIXTURE" ]]; then
  echo "Place a sample PDF at cre-workflow/simulation/sample-bank.pdf or set PDF_PATH"
  PDF_PATH="${PDF_PATH:-}"
  if [[ -z "$PDF_PATH" || ! -f "$PDF_PATH" ]]; then
    exit 1
  fi
  FIXTURE="$PDF_PATH"
fi

PDF_B64=$(base64 -i "$FIXTURE")

curl -s -X POST "$BASE_URL/v1/inference" \
  -H "Authorization: Bearer $INFERENCE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"gemma4\",
    \"system_prompt\": \"You are a tenant screening analyst. Analyze documents inside a TEE. Never output PII. Respond with ONLY valid JSON.\",
    \"prompt\": \"Verify tenant screening. Return ONLY: {\\\"checks\\\":{\\\"nameMatch\\\":\\\"full\\\",\\\"depositMonths\\\":3,\\\"payrollEmployerMonths\\\":4,\\\"bankPayrollAmountMatch\\\":true,\\\"monthlyIncomeUSD\\\":6200,\\\"documentQuality\\\":\\\"high\\\"},\\\"flags\\\":\\\"\\\"}\",
    \"resources\": [{
      \"filename\": \"bank.pdf\",
      \"content_type\": \"application/pdf\",
      \"content_base64\": \"$PDF_B64\"
    }],
    \"cre_callback\": { \"url\": \"$CRE_CALLBACK_URL\" }
  }" | jq '{id, status}'

echo "Watch the CRE simulate terminal for transcriptHash and on-chain tx logs."
