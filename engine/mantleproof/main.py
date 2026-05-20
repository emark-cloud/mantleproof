"""FastAPI app factory.

The engine exposes the locked read surface (`/api/audit/{addr}`, `/api/health`,
`/api/feed`, `/api/cache`, `/api/queries`) plus the paid `/x402/audit/{addr}`
write surface. CORS is wide-open by default — every endpoint is a public read
(the only writer is the oracle-signer hitting `submitAudit` on-chain, never
the HTTP layer), and the frontend, MCP clients, and any third-party agent
should be able to call freely. The x402 paywall is the gate that matters,
not browser origin.

Override allowed origins with ``MANTLEPROOF_CORS_ORIGINS`` (comma-separated)
if you want to lock it down for a production deploy.
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from mantleproof.api import (
    routes_audit,
    routes_cache,
    routes_feed,
    routes_health,
    routes_queries,
    routes_x402,
)


def _cors_origins() -> list[str]:
    """Comma-separated env override; default `*` (wide open public read)."""
    raw = os.getenv("MANTLEPROOF_CORS_ORIGINS", "*").strip()
    if raw in ("", "*"):
        return ["*"]
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def create_app() -> FastAPI:
    app = FastAPI(title="MantleProof", version="0.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins(),
        # Wildcard origins must NOT pair with allow_credentials=True per CORS spec.
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        # x402 needs the X-PAYMENT-RESPONSE header to reach the browser.
        expose_headers=["X-PAYMENT-RESPONSE"],
    )
    app.include_router(routes_health.router)
    app.include_router(routes_audit.router)
    app.include_router(routes_feed.router)
    app.include_router(routes_cache.router)
    app.include_router(routes_queries.router)
    app.include_router(routes_x402.router)
    return app


app = create_app()
