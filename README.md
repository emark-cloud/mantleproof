# MantleProof

> The on-chain **audit oracle** for Mantle's agentic economy — other agents query it
> before touching a contract, get back a structured safety signal in under a second,
> and route their behavior accordingly.

🚧 **Under construction** — Mantle Turing Test Hackathon 2026, AI DevTools track.

## Live links

| | |
|---|---|
| Site | _TBD — Vercel_ |
| Demo video | _TBD_ |
| Contracts | _TBD — Mantle mainnet, verified on Mantlescan_ |
| MCP server | `npx -y mantleproof-mcp` _(TBD — npm)_ |

## What it is

Five Mantle-specific audit dimensions (USDY/mUSD, bridged mETH, Ethena USDe/sUSDe,
Merchant Moe Liquidity Book v2.2 + Uniswap V3, EIP-712 chain-id replay), a two-tier
engine (heuristic + LLM reasoning with a hallucination guard), three query surfaces
(on-chain `getAudit`, MCP, x402), and three live agent-to-agent demos.

Full spec: [`docs/mantleproof.md`](docs/mantleproof.md) ·
Resources: [`docs/resources.md`](docs/resources.md) ·
Design: [`docs/design.md`](docs/design.md) ·
Build guide: [`CLAUDE.md`](CLAUDE.md) · Tasks: [`TODO.md`](TODO.md)

## Quickstart (dev)

```bash
pnpm install
cd engine && python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
docker-compose up -d
cp .env.example .env   # fill in keys — see docs/setup-checklist.md
```

The real README (thesis, Judge Quick Evaluation, contract table, the three demo
receipts, engineering debug log) is written in Week 6 — see `docs/mantleproof.md` §11.

## License

MIT — see [LICENSE](LICENSE). The EIP-8004 registry contracts are MIT so other
Mantle teams can register their agents against them.
