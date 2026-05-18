"""SCAFFOLD route — implement in T21."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/api/health")
async def health() -> dict:
    return {
        "engine": "scaffold",
        "rpc_latency_ms": None,
        "cache_freshness_s": None,
        "version": "0.0.0",
    }
