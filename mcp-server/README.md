# mantleproof-mcp

An MCP server that lets any MCP-aware agent (Claude Desktop, Cursor, etc.)
query the [MantleProof](https://github.com/emark-cloud/mantleproof) on-chain
audit oracle on **Mantle** before touching a contract.

Every audit returned by these tools is:
- anchored on Mantle (`MantleProofRegistry.submitAudit`, signed by the oracle key),
- pinned to IPFS (full report JSON, keccak'd into the on-chain `rootHash`),
- and the rootHash you get back has been **independently recomputed** from the
  IPFS payload by the server before it answers, so the answer carries proof,
  not just trust.

> Status: `getAudit` is live against Mantle mainnet today. `auditContract` is
> cache-first (returns the latest anchored audit if one exists). `requestAudit`
> drives the live x402 paywall — verified end-to-end with a real-USDC paid
> audit on Base + Mantle mainnet (2026-05-22). It surfaces the 402 payment
> requirements; an x402-aware wallet completes the EIP-3009 dance. `payAndAudit`
> goes one step further — it completes that dance itself, paying with a reusable
> wallet it creates and saves on first use (you fund it once with USDC on Base).

## Tools

| Tool | Status | Purpose |
|---|---|---|
| `getAudit(address)` | ✅ live | Read-only lookup against `MantleProofRegistry.getAudit(address)` joined with the IPFS report + keccak integrity check. Free, no signer needed. |
| `auditContract(address, tier)` | ✅ cache hit · ⏳ paid | Return the latest cached audit; if none exists, point the agent at `payAndAudit`. |
| `requestAudit(address, tier)` | ✅ live x402 | Surfaces the 402 payment requirements only — never fabricates a receipt, holds no key. Hand the requirements to an external x402-aware wallet to sign the EIP-3009 authorization. |
| `payAndAudit(address, tier)` | ✅ live x402 | Commission a **fresh** Tier-2 audit and pay for it with a reusable wallet. Signs the EIP-3009 USDC payment on Base (eip155:8453), the engine runs the pipeline + guard and anchors on Mantle (eip155:5000), settles on Base — both txHashes returned. On first use it auto-creates and saves a reusable wallet at `~/.mantleproof/wallet.json`; if unfunded it returns the address for you to fund **once** with USDC on Base, then reuses it forever (`MANTLEPROOF_PAYER_KEY` overrides). Never the oracle key; never a fabricated receipt. |

### Output shape

All four tools return the canonical JSON shape locked by the engine REST
API ([T7](https://github.com/emark-cloud/mantleproof)):

```json
{
  "audited": true,
  "target": "0x1892f77e335C133Ce4a7B28555f13bA74cBB76fA",
  "chain_id": 5000,
  "anchor": {
    "root_hash": "0x6a69e7d4…ca46",
    "severity": "high",
    "severity_uint8": 3,
    "ipfs_cid": "ipfs://bafkrei…ewce",
    "ipfs_uri": "ipfs://bafkrei…ewce",
    "timestamp": 1779263294,
    "submitter": "0x9f17…638a",
    "audit_count": 1
  },
  "integrity": {
    "expected_root_hash": "0x6a69…ca46",
    "recomputed_root_hash": "0x6a69…ca46",
    "match": true
  },
  "report": { "schema": "mantleproof/audit/v1", "findings": [ … ], "hallucination_guard": { "masked_count": 0, "public_note": "Hallucination guard fired: 0 masked" }, "…" : "…" },
  "ipfs_error": null,
  "explorer": { "target": "https://mantlescan.xyz/address/0x1892…76fA" }
}
```

`integrity.match` is the credibility-loop check: the server fetched the IPFS
payload, stripped the post-hash fields, recomputed `keccak256(canonical(json))`,
and compared it to the on-chain `rootHash`. If they don't match, `match` is
`false` and `recomputed_root_hash` is surfaced — never silently hidden.

## Install

### Claude Code (one line, zero config)

```bash
claude mcp add mantleproof -- npx -y mantleproof-mcp
```

That's it — the server defaults to the hosted MantleProof engine, so no API
URL or key is needed. Add `-s project` to share it with everyone who clones a
repo, or `-s user` to enable it across all your projects. Then `/mcp` in a
session lists the four tools.

### Claude Desktop

```json
{
  "mcpServers": {
    "mantleproof": {
      "command": "npx",
      "args": ["-y", "mantleproof-mcp"]
    }
  }
}
```

Environment:

| Var | Default | Purpose |
|---|---|---|
| `MANTLEPROOF_API_BASE` | hosted engine (`…up.railway.app`) | Base URL of the MantleProof engine REST API (`/api/audit/{address}`, `/api/health`). Override to point at a local engine, e.g. `http://localhost:8000`. |
| `MANTLEPROOF_PAYER_KEY` | _(unset → saved wallet)_ | Optional override: private key of a payer wallet for `payAndAudit`. Most users **don't set this** — `payAndAudit` creates and reuses a wallet automatically. Set it only to bring your own key (CI, a pre-funded demo wallet). Never the oracle-signer key. |
| `MANTLEPROOF_WALLET_PATH` | `~/.mantleproof/wallet.json` | Where the auto-created reusable payer wallet is saved (mode `600`). Override to relocate it. |
| `BASE_RPC_URL` | `https://mainnet.base.org` | Base RPC used by `payAndAudit` for the pre-flight USDC balance read. |

## Generate a new audit (seamless, no key setup)

You never pass a private key. Add the server, then just ask:

```bash
claude mcp add mantleproof -- npx -y mantleproof-mcp
```

```
> Audit 0x5d3a…ef34 before I integrate it. If there's no audit yet, get one.
```

The agent calls `getAudit` (miss) → `payAndAudit`. On first use, `payAndAudit`
**creates a reusable wallet** and saves it to `~/.mantleproof/wallet.json`. Since
it starts empty, the agent replies with the wallet address and asks you to fund
it **once**:

```
I created a reusable MantleProof audit wallet for you — it's empty.
(saved at ~/.mantleproof/wallet.json — reusable across all future audits)
Fund it once by sending at least 0.50 USDC on Base (chain id 8453) to:
    0x7C3a…9b2F
then ask me to run the audit again.
```

Send ≥0.50 USDC on Base to that address, then ask again — the agent pays, the
engine runs Tier 1 + Tier 2 + the hallucination guard, anchors on Mantle, settles
on Base, and returns both txHashes. **The wallet is reused for every future
audit** — fund once, top up when it runs low.

> Security: this is a dedicated audit-spending wallet stored in plaintext (mode
> `600`) — keep only small amounts in it; never reuse a key that holds real funds.
> The payer wallet is strictly the *agent's* money, never MantleProof's
> oracle-signer key, and every returned tx hash is a real settlement.

## Local development

```bash
pnpm install
pnpm typecheck
pnpm build               # tsc → build/, chmod +x build/index.js
node build/index.js      # speaks MCP over stdio

# end-to-end smoke against a local engine (talks to live mainnet + IPFS):
node scripts/smoke_stdio.mjs
```

The smoke script spawns the built server, sends `tools/list` + `tools/call` MCP
frames over stdin, and asserts:

1. exactly 4 tools advertised (`auditContract`, `getAudit`, `payAndAudit`,
   `requestAudit`);
2. `getAudit` against a known audited target returns `integrity.match: true`;
3. `requestAudit` against an unaudited target surfaces the 402 payment
   requirements (no fabricated tx);
4. `payAndAudit` against an already-audited target short-circuits to the free
   cache (no payment dance).

## Publishing

This package is published manually by the maintainer:

```bash
pnpm build
npm login
npm publish --access public
```

CI does **not** publish on push — npm credentials never leave a developer
machine. Bump `version` in `package.json` before publishing a new release.

## Architecture

```
agent  ──MCP stdio──▶  mantleproof-mcp  ──HTTP──▶  engine REST API
                       (this package)              /api/audit/{address}
                                                   /api/health
                                                            │
                              ┌─────────────────────────────┼─────────────────────────────┐
                              ▼                             ▼                             ▼
                       Mantle RPC                     IPFS gateway                  (writes only via
                       getAudit(target)               GET {cid}                      oracle signer)
                              │                             │
                              └──── recompute keccak(canonical(report)) ───▶ integrity.match
```

The MCP server is a **thin client** — all chain reads, signing, and integrity
verification happen in the engine. The three query surfaces — on-chain
`getAudit`, REST `/api/audit/{addr}`, and this MCP server — all return the
same canonical JSON. Three doorways, one source of truth.

## License

MIT.
