# mantleproof-mcp

MCP server for the [MantleProof](https://github.com/) audit oracle. Three tools:

- `auditContract(address)` — cached audit, or trigger a paid audit if not cached
- `getAudit(address)` — read-only lookup from `MantleProofRegistry`
- `requestAudit(address, tier)` — paid Tier 2 audit via x402 (USDC on Base)

🚧 Scaffold — implemented in Week 4 (T23).

## Use with Claude Desktop

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

## Build

```bash
pnpm install
pnpm build        # tsc && chmod 755 build/index.js
node build/index.js
```

MIT.
