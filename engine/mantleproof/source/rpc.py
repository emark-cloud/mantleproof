"""Minimal JSON-RPC bytecode fetch (`eth_getCode`).

The checks are source-first but bytecode adds VERIFIED-grade relevance signal
(an address embedded as a PUSH20 constant). Used by the T12 validation
harness; degrades gracefully — callers pass ``b""`` when RPC is unreachable.

`parse_get_code` is pure/unit-tested; `get_code` does live HTTP.
"""

from __future__ import annotations

import httpx


def parse_get_code(payload: dict) -> bytes:
    """Decode an `eth_getCode` JSON-RPC result to raw bytes.

    ``"0x"`` (no code at address) and a missing result decode to ``b""``.
    """
    result = payload.get("result")
    if not isinstance(result, str):
        return b""
    hexstr = result.removeprefix("0x")
    if not hexstr:
        return b""
    try:
        return bytes.fromhex(hexstr)
    except ValueError:
        return b""


def get_code(address: str, rpc_url: str, *, timeout: float = 20.0) -> bytes:
    """Live `eth_getCode` at latest block. Returns b"" if the address has no
    code; raises httpx errors on transport/HTTP failure (caller decides)."""
    resp = httpx.post(
        rpc_url,
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_getCode",
            "params": [address, "latest"],
        },
        timeout=timeout,
    )
    resp.raise_for_status()
    return parse_get_code(resp.json())
