# zkCredentials

Privacy-preserving tenant screening for rental applications.

## Problem

Landlords typically require passport copies, bank statements, and pay stubs during screening. That oversharing exposes legal identity, exact income, and account details before a lease is signed — often to parties who never become the tenant's landlord.

Without a way to prove uniqueness, the same person can also spin up multiple identities with fabricated documents and apply repeatedly.

## Solution

zkCredentials replaces raw document disclosure with a portable screening credential.

1. A **landlord** starts a screening session and shares an invitation link.
2. The **tenant** connects a wallet, verifies with World ID, and uploads screening PDFs.
3. Documents are analyzed inside a **Chainlink Confidential AI Attester** TEE. Only screening conclusions and cryptographic anchors leave the enclave — never legal names, passport numbers, or account details.
4. The tenant publishes those conclusions to **ENS text records** on a screening subname (e.g. `screening.alice.eth`) and signs a message to complete the session.
5. The **landlord** sees pass/fail conclusions, income range buckets, and attestation digests — not the underlying PDFs.

World ID nullifier gating ensures one credential per unique human without revealing the tenant's legal identity to the landlord.

## How everything interacts

```mermaid
flowchart TB
  subgraph Landlord
    L1[Create session at /verify]
    L2[Share /present?session=… link]
    L3[Poll session → view credential]
  end

  subgraph Tenant["Tenant browser"]
    T1[Connect wallet]
    T2[World ID verify]
    T3[Upload PDFs]
    T4[Sign ENS text records]
    T5[SIWE sign for session]
  end

  subgraph App["Next.js app"]
    API[API routes]
    DB[(SQLite — sessions & nullifiers)]
  end

  subgraph Attester["Chainlink Confidential AI Attester"]
    TEE[TEE inference]
  end

  subgraph Optional["Optional — local dev"]
    CRE[CRE Go workflow]
  end

  subgraph Chain["Ethereum / ENS"]
    ENS[screening.{name}.eth text records]
  end

  L1 --> API
  L2 --> T1
  T1 --> T2
  T2 --> API
  API --> DB
  T2 --> T3
  T3 --> API
  API -->|POST /v1/inference| TEE
  TEE -->|callback| API
  API -.->|forward| CRE
  API --> T4
  T4 --> ENS
  T5 --> API
  API --> L3
  L3 --> ENS
```

## Setting up

### Tech stack

| Tool | Role in zkCredentials | Documentation |
|------|----------------------|---------------|
| [Next.js](https://nextjs.org) | App framework — landlord and tenant flows, API routes for sessions, attester callbacks, and World ID verification | [Next.js docs](https://nextjs.org/docs) |
| [World ID](https://world.org/world-id) | Proves the tenant is a unique human before document analysis; nullifier stored to block duplicate credentials | [World ID docs](https://docs.world.org/world-id) |
| [Chainlink Confidential AI Attester](https://chain.link/privacy) | Runs PDF screening inside a TEE; returns JSON conclusions plus `transcriptHash` / `documentDigest` anchors | [Chainlink Privacy / Confidential Compute](https://chain.link/privacy) |
| [CRE (Chainlink Runtime Environment)](https://chain.link/cre) | Optional Go workflow that receives Attester callbacks locally, scores results, and can write on-chain | [CRE docs](https://docs.chain.link/cre) |
| [ENS](https://ens.domains) | Stores screening conclusions as resolver text records on a `screening.{name}.eth` subname | [ENS docs](https://docs.ens.domains/) · [ensjs](https://github.com/ensdomains/ensjs) |
| [viem](https://viem.sh) + [wagmi](https://wagmi.sh) + [RainbowKit](https://rainbowkit.com) | Wallet connection, ENS transaction signing, and SIWE session completion | [viem](https://viem.sh/docs/getting-started) · [wagmi](https://wagmi.sh/react/getting-started) · [RainbowKit](https://www.rainbowkit.com/docs/introduction) |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Local persistence for verification sessions and World ID nullifier state | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3#readme) |
| [Tailwind CSS](https://tailwindcss.com) | Styling | [Tailwind docs](https://tailwindcss.com/docs) |

### Prerequisites

- Node.js 20+
- npm
- [World ID app](https://developer.world.org) (app ID, RP ID, signing key)
- [WalletConnect project ID](https://cloud.walletconnect.com)
- Alchemy (or other) RPC URL for Sepolia or mainnet
- An ENS name you control on that network
- **Chainlink Attester:** `INFERENCE_API_KEY` from the Chainlink desk
- **Local Attester callbacks:** [ngrok](https://ngrok.com) or deploy to Vercel (callback URL auto-derived from `VERCEL_URL`)
- **Optional CRE workflow:** [CRE CLI](https://docs.chain.link/cre) v1.19+, Go 1.21+

### Install

```bash
npm install
cd cre-workflow && go mod tidy   # only if using the CRE workflow locally
```

Create `.env.local` in the project root:

```bash
# World ID — https://developer.world.org
NEXT_PUBLIC_WORLD_APP_ID=
WORLD_RP_ID=
RP_SIGNING_KEY=

# ENS — 11155111 for Sepolia, 1 for mainnet
NEXT_PUBLIC_ENS_CHAIN_ID=11155111
NEXT_PUBLIC_REGISTRY_PARENT=yourname.eth
ALCHEMY_RPC=
NEXT_PUBLIC_ALCHEMY_RPC=

# WalletConnect
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Chainlink Confidential AI Attester
CHAINLINK_ATTESTER_URL=https://confidential-ai-dev-preview.cldev.cloud
INFERENCE_API_KEY=

# Local dev only — public URL for Attester callbacks (ngrok + CRE trigger, or Next.js callback)
CRE_CALLBACK_URL=
CRE_TRIGGER_FORWARD_URL=http://localhost:2000/trigger   # optional: forward to CRE

# Dev shortcuts
USE_CRE_FIXTURE=true          # skip live Attester; use local fixture
SKIP_WORLD_ID_VERIFY=true     # skip World ID in development
NEXT_PUBLIC_SKIP_WORLD_ID_VERIFY=true
```

Never commit `.env.local` or API keys.

### Run locally

```bash
npm run dev
```

- Landlord flow: [http://localhost:3000/verify](http://localhost:3000/verify)
- Tenant flow: open the `/present?session=…` link from the landlord

Set `USE_CRE_FIXTURE=true` to demo without ngrok or a live Attester key.

For end-to-end Attester callbacks locally:

1. Expose your callback URL (ngrok to port 2000 for CRE, or port 3000 for the Next.js `/api/attester/callback` route).
2. Set `CRE_CALLBACK_URL` to that public URL.
3. Optionally run the CRE workflow: `cd cre-workflow && cre workflow simulate . --broadcast --non-interactive`

### Deploy to Vercel

On Vercel, `CRE_CALLBACK_URL` is optional — the app derives `https://<your-domain>/api/attester/callback` from `VERCEL_URL`.

Add the environment variables above in **Project → Settings → Environment Variables**. Do not set `USE_CRE_FIXTURE=true` in production.

After deploy:

1. Add your Vercel URL to allowed origins in the [World ID developer portal](https://developer.world.org).
2. Allow your domain in WalletConnect Cloud if prompted.
3. Tenants still need Sepolia ETH (or mainnet ETH) and an ENS name to publish credentials.

### What landlords see

Screening conclusions on `screening.{name}.eth` — never raw PDFs:

| Field | Meaning |
|-------|---------|
| `humanVerified` | World ID uniqueness (not legal identity) |
| `documentOwnershipVerified` | Passport anchors bank + payroll ownership |
| `documentsConsistent` | Financial docs align internally |
| `incomeVerified` / `incomeRange` | Meets threshold, bucketed range |
| `employmentStable` | Same employer 3+ months |
| `transcriptHash` / `documentDigest` | Attester cryptographic anchors |
| `rotatingPaymentAddr` | Fresh payment alias per landlord share |
