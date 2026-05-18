"""FastAPI app factory. SCAFFOLD — routers return 501 stubs (implement W4/T21)."""

from __future__ import annotations

from fastapi import FastAPI

from mantleproof.api import routes_audit, routes_cache, routes_feed, routes_health, routes_queries


def create_app() -> FastAPI:
    app = FastAPI(title="MantleProof", version="0.0.0")
    app.include_router(routes_health.router)
    app.include_router(routes_audit.router)
    app.include_router(routes_feed.router)
    app.include_router(routes_cache.router)
    app.include_router(routes_queries.router)
    return app


app = create_app()
