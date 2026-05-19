"""Verified-source resolver (Etherscan API V2).

Etherscan V2 is mandatory since 2026 — the old per-explorer V1 endpoints
(api.mantlescan.xyz/api) are shut down. One etherscan.io key works across all
chains via the unified endpoint, routed by a ``chainid`` query param. The
audit engine resolves the source of *mainnet* targets even while running on
Sepolia (CLAUDE.md) — chainid follows the requested target chain, not the
engine's MANTLE_NETWORK.

`parse_getsourcecode` is a pure, unit-tested function (no network/key). Live
HTTP needs ETHERSCAN_API_KEY (raises a clear error if missing).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

import httpx

from mantleproof.settings import get_settings

# Etherscan API V2 unified endpoint. chainid is a query param (see _get).
ETHERSCAN_V2_URL = "https://api.etherscan.io/v2/api"
_SUPPORTED_CHAINS = {5000, 5003}


def api_base(chain_id: int) -> str:
    if chain_id not in _SUPPORTED_CHAINS:
        raise KeyError(f"Unsupported chainId {chain_id}")
    return ETHERSCAN_V2_URL


@dataclass(slots=True)
class ContractSource:
    address: str
    name: str
    compiler_version: str
    is_proxy: bool
    implementation: str | None
    abi: str  # raw ABI JSON string ("" / "Contract source code not verified")
    sources: dict[str, str] = field(default_factory=dict)  # path -> code

    @property
    def verified(self) -> bool:
        return bool(self.sources)

    def flat(self) -> str:
        """All source files concatenated (stable order) for scanning/prompting."""
        return "\n\n".join(f"// === {p} ===\n{c}" for p, c in sorted(self.sources.items()))


def _parse_source_code_field(raw: str, fallback_name: str) -> dict[str, str]:
    """Etherscan SourceCode is either flat Solidity, a single-JSON object, or a
    standard-json-input wrapped in DOUBLE braces ``{{ ... }}``.
    """
    s = (raw or "").strip()
    if not s:
        return {}
    if s.startswith("{{") and s.endswith("}}"):
        s = s[1:-1]  # unwrap double-brace standard-json-input
    if s.startswith("{"):
        try:
            obj = json.loads(s)
        except json.JSONDecodeError:
            return {f"{fallback_name}.sol": raw}
        files = obj.get("sources", obj)
        out: dict[str, str] = {}
        for path, entry in files.items():
            if isinstance(entry, dict) and "content" in entry:
                out[path] = entry["content"]
            elif isinstance(entry, str):
                out[path] = entry
        return out or {f"{fallback_name}.sol": raw}
    return {f"{fallback_name}.sol": raw}


def parse_getsourcecode(address: str, payload: dict) -> ContractSource | None:
    """Pure parser for an Etherscan `getsourcecode` JSON response."""
    if str(payload.get("status")) != "1":
        return None
    result = payload.get("result") or []
    if not result or not isinstance(result, list):
        return None
    r = result[0]
    name = r.get("ContractName") or "Unknown"
    impl = (r.get("Implementation") or "").strip() or None
    return ContractSource(
        address=address,
        name=name,
        compiler_version=r.get("CompilerVersion", ""),
        is_proxy=str(r.get("Proxy", "0")) == "1",
        implementation=impl,
        abi=r.get("ABI", ""),
        sources=_parse_source_code_field(r.get("SourceCode", ""), name),
    )


class MantlescanClient:
    """Thin Etherscan API V2 client. `chain_id` routes via the chainid param."""

    def __init__(self, chain_id: int, *, timeout: float = 20.0) -> None:
        if chain_id not in _SUPPORTED_CHAINS:
            raise KeyError(f"Unsupported chainId {chain_id}")
        self.chain_id = chain_id
        self._timeout = timeout
        self._key = get_settings().etherscan_api_key

    def _get(self, params: dict[str, str]) -> dict:
        if not self._key:
            raise RuntimeError(
                "ETHERSCAN_API_KEY not set — required for live source resolution "
                "(Etherscan API V2, see docs/setup-checklist.md). The parser is "
                "usable without a key."
            )
        params = {
            **params,
            "chainid": str(self.chain_id),
            "apikey": self._key,
        }
        resp = httpx.get(ETHERSCAN_V2_URL, params=params, timeout=self._timeout)
        resp.raise_for_status()
        return resp.json()

    def get_source(self, address: str, *, follow_proxy: bool = True) -> ContractSource | None:
        payload = self._get(
            {"module": "contract", "action": "getsourcecode", "address": address}
        )
        src = parse_getsourcecode(address, payload)
        if src and follow_proxy and src.is_proxy and src.implementation:
            impl = self.get_source(src.implementation, follow_proxy=False)
            if impl and impl.verified:
                return impl
        return src
