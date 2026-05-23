#!/usr/bin/env python3
"""Backfill the known mainnet x402 paid-audit receipt(s) into the on-disk store.

The x402 receipt persistence layer (ReceiptStore + routes_x402._default_record_receipt)
was added AFTER the live 2026-05-22 USDe paid-audit run on Mantle mainnet, so that
historical receipt is not in the store. ``engine/data/`` is gitignored (T29
cache-warmer outputs), so this committed, idempotent seed script is the
deploy-time source of truth for the demo receipt.

Idempotent: re-running upserts by rootHash; the row's recorded_at is bumped each
time but the row stays unique.

    cd engine && python scripts/backfill_x402_receipt.py
"""

from __future__ import annotations

import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from mantleproof.triage.store import ReceiptStore, X402ReceiptRow  # noqa: E402
from mantleproof.x402.builder import (  # noqa: E402
    NETWORK,
    TIER2_PRICE_BASE_UNITS,
    USDC_BASE_MAINNET,
)

# The 2026-05-22 USDe (Ethena on Mantle) paid-audit run. Receipts ledger
# entry in `TODO.md` (decisions log) carries the same hashes/addresses.
USDE_RECEIPT = X402ReceiptRow(
    root_hash="0x13e8d5d54a4635aaa6b7af77c661cf5fbe8ac8953eda4e58337d2fbd92f39316",
    target="0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34",
    payer="0x4354d518eD2060b315995E68268f019C074fc1f3",  # DEPLOYER_AGENT
    payment_chain=NETWORK,         # "base"
    payment_chain_id=8453,         # Base mainnet
    payment_tx="0x98c5137d815b9cad381d959cde0a01d07a0d8c1f11a88669721f008848700cd1",
    anchor_chain="mantle",
    anchor_chain_id=5000,          # Mantle mainnet
    anchor_tx="0xbffe7ca550eb965f999730eab0d7f559fcabd35dcbf35e4aa17c9479e95930ff",
    amount_base_units=TIER2_PRICE_BASE_UNITS,  # "500000" = 0.50 USDC (6 decimals)
    asset=USDC_BASE_MAINNET,       # canonical Base USDC contract
    severity="high",
    settle_error=None,
    recorded_at=int(time.time()),
)


def main() -> int:
    store = ReceiptStore()
    store.record(USDE_RECEIPT)
    snap = store.load()
    rows = snap.rows if snap else ()
    print(f"[ok] receipt store: {store.path}")
    print(f"[ok] rows: {len(rows)}")
    for r in rows:
        print(f"      rootHash={r.root_hash}  target={r.target}  payer={r.payer}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
