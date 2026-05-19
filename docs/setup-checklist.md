# Setup checklist — external accounts & keys

Runbook for everything that gates Week 1. Status reflects what the builder confirmed
on 2026-05-18.

## Already held ✅
- Funded wallets: MNT on Mantle mainnet, USDC on Base. _(Also need MNT on Mantle Sepolia — get from faucet, below.)_
- Railway account (engine + Postgres + Redis hosting).
- Vercel account (frontend hosting).
- Gemini API key (default LLM provider).

## To obtain 🔲

### Etherscan API V2 key — gates T9 (source resolver) + T4 (verify)
1. Go to https://etherscan.io/ → register → https://etherscan.io/myapikey → Add.
2. **Etherscan API V2**: one key, chainId-routed via
   `https://api.etherscan.io/v2/api`, covers Mantle mainnet (5000) AND Mantle
   Sepolia (5003) — plus 60+ other chains. Free tier covers hackathon scale.
3. Put in `.env` as `ETHERSCAN_API_KEY`.
4. The old per-explorer V1 API (`api.mantlescan.xyz/api`) was **shut down**
   in 2026 — a standalone Mantlescan key no longer works for verify or the
   source resolver. `MANTLESCAN_API_KEY` is legacy/unused; leave it blank.

### Pinata JWT — gates T20 (IPFS pin of full audit reports)
1. https://www.pinata.cloud/ → free account → API Keys → new key with `pinFileToIPFS`/`pinJSONToIPFS` scopes.
2. Copy the **JWT** (not the legacy API key/secret) → `.env` as `PINATA_JWT`.
3. Alt: web3.storage / Filecoin Pin (resources.md §10) — only if Pinata free tier is exhausted.

### Mantle Sepolia test MNT — gates T4 (testnet deploy)
1. Faucet/explorer: https://5003.testnet.routescan.io/ (Chain ID 5003).
2. Fund the `DEPLOYER_PRIVATE_KEY` address and the three demo-agent addresses on Sepolia.

### Optional provider keys — gate ONLY key-gated provider smoke tests (never critical path)
- `ANTHROPIC_API_KEY` — only if running `AUDIT_LLM_PROVIDER=claude`.
- `ZAI_API_KEY` — only if running `AUDIT_LLM_PROVIDER=zai`. Z.ai (Zhipu/GLM) is on the
  judging panel; the adapter ships interface-complete regardless, README credits it.

## Day-1 action 🔲
- **T1 — DoraHacks discussion board post:** does Mantle ship official ERC-8004
  Identity/Reputation/Validation registries that hackathon agents register against, or
  does each team deploy their own? Default to **Path B** (deploy our own) while waiting;
  collapse to Path A only if Mantle confirms central deployment. Soft-blocks T3 only.
  Board: https://dorahacks.io/hackathon/mantleturingtesthackathon2026/detail

## Compute credits 🔲
- Apply early via https://devhub.mantle.xyz/ — shared $110K inference + on-chain data
  budget across teams. Not blocking but free runway.
