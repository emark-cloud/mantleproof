"""Live smoke for /api/audit/{address} on Mantle mainnet (T7).

Runs the in-process FastAPI app against the real mainnet RPC + IPFS gateway,
hitting one of the three demo audit targets we anchored in T26/T27/T28. This is
NOT a CI test — it talks to mainnet, costs no gas (pure read), and exists so we
can prove the route really resolves the on-chain → IPFS → integrity loop.

Usage:
    cd engine && . .venv/bin/activate
    MANTLE_NETWORK=mantle python scripts/smoke_get_audit_mainnet.py [target]

Default target = Demo 1's BuggyYieldVault. Other choices:
    0x8f6679eb031799fc9c5e149dfb75b4543808912f  (Demo 2 — BackdooredMemeToken)
    0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a  (Demo 3 — LBRouter)
"""

from __future__ import annotations

import json
import os
import pathlib
import sys

# Force mainnet selection BEFORE Settings is imported (it caches via lru_cache).
os.environ.setdefault("MANTLE_NETWORK", "mantle")

# Lift registry address from the same deployments JSON the pipeline writes;
# scripts are allowed to read contracts/ artifacts even though the engine itself
# is not (CLAUDE.md).
_DEPLOYMENTS = (
    pathlib.Path(__file__).resolve().parents[2]
    / "contracts"
    / "deployments"
    / "mantle.addresses.json"
)
if _DEPLOYMENTS.exists() and not os.environ.get("MANTLEPROOF_REGISTRY_ADDRESS"):
    _d = json.loads(_DEPLOYMENTS.read_text())
    os.environ["MANTLEPROOF_REGISTRY_ADDRESS"] = _d["contracts"]["MantleProofRegistry"]

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from mantleproof.main import create_app  # noqa: E402
from mantleproof.settings import get_settings  # noqa: E402

DEFAULT_TARGET = "0x1892f77e335C133Ce4a7B28555f13bA74cBB76fA"  # Demo 1 vault


def main() -> int:
    if os.environ.get("MANTLE_NETWORK") != "mantle":
        print("[smoke] refusing to run: set MANTLE_NETWORK=mantle first")
        return 2
    target = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TARGET

    get_settings.cache_clear()  # type: ignore[attr-defined]
    s = get_settings()
    print(f"[smoke] network=mantle chain_id={s.chain_id} registry={s.mantleproof_registry_address}")
    print(f"[smoke] target ={target}")
    if not s.mantleproof_registry_address:
        print("[smoke] MANTLEPROOF_REGISTRY_ADDRESS not set — aborting")
        return 2

    client = TestClient(create_app())

    # 1. /api/health — chain reachable + registry oracleSigner readable.
    h = client.get("/api/health").json()
    print(f"[health] engine={h['engine']} block={h['rpc']['block_number']} "
          f"latency_ms={h['rpc']['latency_ms']} oracle={h['oracle_signer']}")
    if h["engine"] != "ok":
        print(f"[health] rpc_error={h['rpc']['error']!r}")
        print(f"[health] oracle_error={h['oracle_error']!r}")

    # 2. /api/audit/{target} — on-chain anchor + IPFS report + integrity check.
    r = client.get(f"/api/audit/{target}")
    print(f"[audit] http={r.status_code}")
    body = r.json() if r.status_code != 404 else r.json().get("detail", {})
    print(json.dumps(
        {
            "audited": body.get("audited"),
            "anchor": body.get("anchor"),
            "integrity": body.get("integrity"),
            "ipfs_error": body.get("ipfs_error"),
            "report_keys": sorted(body.get("report", {}).keys()) if body.get("report") else None,
        },
        indent=2,
    ))

    if r.status_code == 200:
        integ = body["integrity"]
        if integ.get("match") is True:
            print("[smoke] OK — on-chain rootHash matches recomputed IPFS canonical hash")
            return 0
        if integ.get("match") is False:
            print("[smoke] INTEGRITY MISMATCH — surfaced honestly, not hidden")
            return 1
        print(f"[smoke] IPFS unfetchable: {body.get('ipfs_error')}")
        return 1
    print(f"[smoke] unexpected response: {r.status_code}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
