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
> requirements; an x402-aware wallet completes the EIP-3009 dance.

## Tools

| Tool | Status | Purpose |
|---|---|---|
| `getAudit(address)` | ✅ live | Read-only lookup against `MantleProofRegistry.getAudit(address)` joined with the IPFS report + keccak integrity check. Free, no signer needed. |
| `auditContract(address, tier)` | ✅ cache hit · ⏳ paid | Return the latest cached audit; if none exists, point the agent at `requestAudit`. |
| `requestAudit(address, tier)` | ✅ live x402 | Pay 0.50 USDC on Base (eip155:8453); audit anchors on Mantle (eip155:5000); both txHashes returned. Surfaces the 402 payment requirements — never fabricates a receipt; an x402-aware wallet signs the EIP-3009 authorization. |

### Output shape

All three tools return the canonical JSON shape locked by the engine REST
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
session lists the three tools.

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

1. exactly 3 tools advertised (`auditContract`, `getAudit`, `requestAudit`);
2. `getAudit` against a known audited target returns `integrity.match: true`;
3. `requestAudit` against an unaudited target returns `isError: true` with an
   honest "T11 not deployed" message (no fabricated tx).

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
