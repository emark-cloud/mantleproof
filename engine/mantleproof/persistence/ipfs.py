"""Pinata pin client — pin the full audit report JSON to IPFS (T20 + T43-followup).

Step 5 of the pipeline (docs/mantleproof.md §5): the assembled report JSON is
pinned to IPFS so the rootHash anchored on-chain is independently resolvable.

**Why pinFileToIPFS, not pinJSONToIPFS** (root-caused 2026-05-24): Pinata's
``pinJSONToIPFS`` re-canonicalizes the JSON before pinning — specifically, it
strips ``.0`` from integer-valued floats (``1.0`` → ``1``). This silently
mutated our ``metrics_ref.{precision,recall,f1}`` values on every audit since
T32 (when those fields were added), breaking the invariant
``keccak(canonical(IPFS body without root_hash)) == on-chain rootHash``. The
trust path still held (rootHash on-chain matched the embedded ``root_hash``
field; oracle invariants intact) but the "anyone can re-derive rootHash from
IPFS bytes" property was broken.

The fix: serialize the report ourselves using the SAME canonical settings
as ``pipeline._canonical`` (``sort_keys=True, separators=(',',':'),
ensure_ascii=False``), then upload those EXACT bytes via ``pinFileToIPFS``.
Pinata stores them verbatim, so the CID points to bytes whose keccak (after
stripping ``root_hash``) equals the on-chain rootHash.

``_canonical_bytes`` is pure / unit-tested. ``pin_json`` does the live HTTP
and raises a clear error if the JWT is missing — the audit must fail loudly
rather than anchor a rootHash whose JSON nobody can fetch.
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from mantleproof.settings import get_settings

PINATA_PIN_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS"


def _canonical_bytes(report: dict[str, Any]) -> bytes:
    """Pure: the exact bytes that will be uploaded to IPFS.

    MUST match the canonical form used by ``pipeline._canonical`` /
    ``pipeline.compute_root_hash`` so that
    ``keccak(canonical_bytes minus root_hash field) == rootHash``.
    """
    return json.dumps(
        report,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def pin_json(report: dict[str, Any], *, jwt: str | None = None, timeout: float = 30.0) -> str:
    """Pin `report` to IPFS via Pinata; return the CID (no ``ipfs://`` prefix).

    Sends EXACT canonical bytes via ``pinFileToIPFS`` (not the JSON-pinning
    endpoint, which silently re-canonicalizes). Raises ``RuntimeError`` if no
    JWT is configured — anchoring a rootHash whose JSON is unresolvable would
    silently break the trust artifact.
    """
    jwt = jwt if jwt is not None else get_settings().pinata_jwt
    if not jwt:
        raise RuntimeError(
            "PINATA_JWT not set — cannot pin the audit report to IPFS "
            "(gates T20, see docs/setup-checklist.md). Refusing to anchor a "
            "rootHash whose JSON nobody can fetch."
        )
    target = str(report.get("target", "unknown"))
    body = _canonical_bytes(report)
    # httpx multipart: list-of-tuples form so file + metadata + options each
    # become their own form-data field. Mixing 2- and 3-tuples upsets mypy
    # when the dict form is used; the list form is uniformly 3-tuples.
    metadata = json.dumps(
        {
            "name": f"mantleproof-audit-{target}",
            "keyvalues": {
                "target": target,
                "tier": str(report.get("tier", "")),
                "rootHash": str(report.get("root_hash", "")),
            },
        }
    )
    options = json.dumps({"cidVersion": 1})
    files: list[tuple[str, tuple[str | None, bytes | str, str | None]]] = [
        ("file", (f"mantleproof-audit-{target}.json", body, "application/json")),
        ("pinataMetadata", (None, metadata, None)),
        ("pinataOptions", (None, options, None)),
    ]
    resp = httpx.post(
        PINATA_PIN_FILE_URL,
        headers={"Authorization": f"Bearer {jwt}"},
        files=files,  # type: ignore[arg-type]
        timeout=timeout,
    )
    resp.raise_for_status()
    cid = resp.json().get("IpfsHash")
    if not cid:
        raise RuntimeError(f"Pinata returned no IpfsHash: {resp.text[:200]}")
    return str(cid)
