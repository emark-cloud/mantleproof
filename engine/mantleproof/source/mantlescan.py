"""Verified-source resolver (Etherscan-compatible).

Mantle mainnet (5000) uses Mantlescan; Mantle Sepolia (5003) uses Routescan.
The audit engine resolves the source of *mainnet* targets even while running
on Sepolia (CLAUDE.md) — base URL follows the requested chainId, not the
engine's MANTLE_NETWORK.

`parse_getsourcecode` is a pure, unit-tested function (no network/key). Live
HTTP needs MANTLESCAN_API_KEY (gated on T1-setup; raises a clear error if
missing) and is kept thin around the parser.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

import httpx

from mantleproof.settings import get_settings

# Etherscan-compatible API bases per chain. Confirmed 2026-05-19 via
# docs.mantlescan.xyz: one Mantlescan API key works across mainnet AND Sepolia.
_API_BASE: dict[int, str] = {
    5000: "https://api.mantlescan.xyz/api",
    5003: "https://api-sepolia.mantlescan.xyz/api",
}


def api_base(chain_id: int) -> str:
    if chain_id not in _API_BASE:
        raise KeyError(f"No explorer API base for chainId {chain_id}")
    return _API_BASE[chain_id]


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
    """Thin Etherscan-compatible client. `chain_id` selects the explorer."""

    def __init__(self, chain_id: int, *, timeout: float = 20.0) -> None:
        self.chain_id = chain_id
        self._timeout = timeout
        self._key = get_settings().mantlescan_api_key

    def _get(self, params: dict[str, str]) -> dict:
        if not self._key:
            raise RuntimeError(
                "MANTLESCAN_API_KEY not set — required for live source resolution "
                "(see docs/setup-checklist.md). Parser is usable without a key."
            )
        params = {**params, "apikey": self._key}
        resp = httpx.get(api_base(self.chain_id), params=params, timeout=self._timeout)
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
