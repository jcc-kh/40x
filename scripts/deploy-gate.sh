#!/usr/bin/env bash
set -euo pipefail

# Deploy TenantCredentialGate to Ethereum Sepolia.
# MockKeystoneForwarder for cre workflow simulate --broadcast:
#   0x15fC6ae953E024d975e77382eEeC56A9101f9F88

if [[ -z "${CRE_ETH_PRIVATE_KEY:-}" ]]; then
  echo "Set CRE_ETH_PRIVATE_KEY in .env.local and run: source .env.local"
  exit 1
fi

RPC_URL="${ALCHEMY_RPC:-https://ethereum-sepolia-rpc.publicnode.com}"
FORWARDER="${KEYSTONE_FORWARDER:-0x15fC6ae953E024d975e77382eEeC56A9101f9F88}"

forge create contracts/TenantCredentialGate.sol:TenantCredentialGate \
  --broadcast \
  --rpc-url "$RPC_URL" \
  --private-key "$CRE_ETH_PRIVATE_KEY" \
  --constructor-args "$FORWARDER"

echo "Update cre-workflow/config.staging.json consumerAddress and NEXT_PUBLIC_TENANT_CREDENTIAL_GATE_ADDRESS"
