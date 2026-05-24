"""IPFS counter-claim fetch helper.

Pure URL-builder + a tiny live fetch. The fetch parses the counter-claim into
the ``{"cid": str, "claim": str, "raw": dict | None}`` shape consumed by
``tier2/prompt.py::_reaudit_block``.

Accepts either a plain text claim (one document, plaintext) or a JSON
document with a top-level ``claim`` field. Anything else is rejected — the
engine should refuse to re-audit if the disputer's evidence is illegible.
"""

from __future__ import annotations

import json
from typing import Any

from mantleproof.settings import get_settings


def gateway_url(cid: str, *, gateway: str | None = None) -> str:
    """Pure: build the gateway URL for a CID."""
    s = get_settings()
    gw = gateway or s.ipfs_gateway
    if not gw.endswith("/"):
        gw = gw + "/"
    return gw + cid


def parse_counter_claim(cid: str, body: bytes) -> dict[str, Any]:
    """Pure: turn a raw IPFS body into the dict shape the reaudit prompt uses.

    Tries JSON first; falls back to UTF-8 plaintext. Rejects empty bodies.
    """
    if not body:
        raise ValueError(f"counter-claim {cid} is empty")
    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError(f"counter-claim {cid} is not UTF-8") from exc
    text = text.strip()
    if not text:
        raise ValueError(f"counter-claim {cid} is blank")
    raw: dict | None = None
    if text.startswith("{"):
        try:
            raw = json.loads(text)
        except json.JSONDecodeError:
            raw = None
    claim = ""
    if isinstance(raw, dict):
        claim = str(raw.get("claim") or raw.get("text") or "")
    if not claim:
        # Treat the whole body as the claim text.
        claim = text
    return {"cid": cid, "claim": claim[:8000], "raw": raw}


def fetch_counter_claim(
    cid: str,
    *,
    gateway: str | None = None,
    timeout: float = 30.0,
) -> dict[str, Any]:
    """Live: GET ``<gateway>/<cid>`` and parse the response."""
    import httpx

    url = gateway_url(cid, gateway=gateway)
    r = httpx.get(url, timeout=timeout)
    r.raise_for_status()
    return parse_counter_claim(cid, r.content)
