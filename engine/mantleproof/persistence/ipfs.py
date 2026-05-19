"""Pinata pin client — pin the full audit report JSON to IPFS (T20).

Step 5 of the pipeline (docs/mantleproof.md §5): the assembled report JSON is
pinned to IPFS so the rootHash anchored on-chain is independently resolvable.
We use Pinata's ``pinJSONToIPFS`` REST endpoint (Bearer ``PINATA_JWT``).

``_pin_payload`` is a pure, unit-tested function (no network/JWT). ``pin_json``
does the live HTTP and raises a clear error if the JWT is missing — the audit
must fail loudly rather than anchor a rootHash whose JSON nobody can fetch.
"""

from __future__ import annotations

from typing import Any

import httpx

from mantleproof.settings import get_settings

PINATA_PIN_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS"


def _pin_payload(report: dict[str, Any]) -> dict[str, Any]:
    """Pure: wrap the report in Pinata's pinJSONToIPFS request body.

    ``pinataContent`` is the exact JSON whose keccak is the on-chain rootHash;
    do not reshape it here or the hash will not match the pinned bytes.
    """
    target = report.get("target", "unknown")
    return {
        "pinataContent": report,
        "pinataMetadata": {
            "name": f"mantleproof-audit-{target}",
            "keyvalues": {
                "target": str(target),
                "tier": str(report.get("tier", "")),
                "rootHash": str(report.get("root_hash", "")),
            },
        },
        "pinataOptions": {"cidVersion": 1},
    }


def pin_json(report: dict[str, Any], *, jwt: str | None = None, timeout: float = 30.0) -> str:
    """Pin `report` to IPFS via Pinata; return the CID (no ``ipfs://`` prefix).

    Raises ``RuntimeError`` if no JWT is configured — anchoring a rootHash whose
    JSON is unresolvable would silently break the trust artifact.
    """
    jwt = jwt if jwt is not None else get_settings().pinata_jwt
    if not jwt:
        raise RuntimeError(
            "PINATA_JWT not set — cannot pin the audit report to IPFS "
            "(gates T20, see docs/setup-checklist.md). Refusing to anchor a "
            "rootHash whose JSON nobody can fetch."
        )
    resp = httpx.post(
        PINATA_PIN_JSON_URL,
        headers={"Authorization": f"Bearer {jwt}"},
        json=_pin_payload(report),
        timeout=timeout,
    )
    resp.raise_for_status()
    cid = resp.json().get("IpfsHash")
    if not cid:
        raise RuntimeError(f"Pinata returned no IpfsHash: {resp.text[:200]}")
    return str(cid)
