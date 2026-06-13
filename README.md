# zkCredentials

Privacy-preserving income credentials for rental applications. Tenants upload financial documents, AI analyzes them inside a Chainlink CRE TEE simulation, World ID prevents duplicate credentials, and conclusions are stored on ENS text records.

## Architecture

```
Tenant PDFs → client-side text extraction → /api/chainlink
  → cre workflow simulate (Go + confidentialhttp + Gemini)
  → attestation JSON → user signs 12 ENS setText txs
Landlord → /api/credential?ensName=alice.eth → ENS read
```

**Privacy:** raw document text is never stored. SQLite only holds World ID nullifiers for sybil resistance. ENS stores booleans, income buckets, and attestation hash — not names, account numbers, or exact salary.

## Prerequisites

1. **CRE CLI** — `curl -sSL https://app.chain.link/cre/install.sh | bash` then `cre login`
2. **Go 1.21+**
3. **Gemini API key** in `cre-workflow/.env`
4. **World ID app** at [developer.world.org](https://developer.world.org) — capture `app_id`, `rp_id`, `RP_SIGNING_KEY`
5. **WalletConnect project ID**
6. **Alchemy/Infura RPC** for mainnet or Sepolia
7. **ENS name** you own on the target network

## Setup

```bash
cp .env.local.example .env.local
cp cre-workflow/.env.example cre-workflow/.env
# Fill in all values

npm install
cd cre-workflow && go mod tidy
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_WORLD_APP_ID` | World ID app ID |
| `WORLD_RP_ID` | World ID RP ID (server-only) |
| `RP_SIGNING_KEY` | World ID signing key (server-only, once) |
| `NEXT_PUBLIC_ENS_CHAIN_ID` | `1` mainnet or `11155111` Sepolia |
| `ALCHEMY_RPC` | Server-side RPC for ENS reads |
| `NEXT_PUBLIC_ALCHEMY_RPC` | Client RPC (optional) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect |
| `CRE_WORKFLOW_PATH` | Default `./cre-workflow` |
| `CRE_CLI_PATH` | Default `cre` |

Gemini key goes in `cre-workflow/.env`:

```bash
GEMINI_API_KEY_ENV=your_key
```

## Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the tenant flow and `/verify` for landlords.

## Test CRE workflow (Chainlink demo)

```bash
cd cre-workflow
cre workflow simulate . --target staging-settings \
  --non-interactive --trigger-index 0 \
  --http-payload '{"passportText":"Jane Smith DOB 1990-01-15 Passport No X123","bankText":"Account holder Jane Smith. Jan 1 salary deposit $6500. Feb 1 salary deposit $6500. Mar 1 salary deposit $6500.","payrollText":"Employee Jane Smith, Employer Acme Corp, Monthly salary $6500, pay dates Jan Feb Mar 2026","thresholdUSD":5000,"worldIdNullifier":"0xabc123"}'
```

Record terminal output showing `Workflow Simulation Result:` JSON for judges.

## confidenceScore rubric

Gemini returns structured `checks`; Go computes the score deterministically:

| Dimension | Weight |
|-----------|--------|
| Name match across docs | 25% |
| Income vs threshold | 25% |
| Deposit stability (months/3) | 20% |
| Employment stability (months/3) | 15% |
| Bank↔payroll amount match | 10% |
| Document text quality | 5% |

`verified = identityVerified AND incomeVerified AND confidenceScore >= 0.70`

## Demo script

1. **Tenant:** connect wallet → enter `yourname.eth` → World ID → upload passport/bank/payroll PDFs → wait for TEE simulation → sign 12 ENS transactions
2. **Landlord:** go to `/verify`, enter same ENS name, see live credential
3. **Sybil test:** attempt a second credential with the same World ID → blocked

## Simulation caveat

In local simulate mode, document text briefly passes through the Next.js server on its way to `cre workflow simulate`. Production CRE deployment would keep that path inside the DON/TEE. This project intentionally skips deployment and uses simulate only.

## Project structure

```
app/                 Next.js routes and pages
components/          UI components
lib/                 ENS, Chainlink subprocess, nullifiers, types
cre-workflow/        Go CRE workflow (confidentialhttp + Gemini)
data/                SQLite nullifiers (gitignored, created at runtime)
```
