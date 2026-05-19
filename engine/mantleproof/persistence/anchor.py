"""Web3.py writer — anchor rootHash + severity to MantleProofRegistry (T20).

Step 6 of the pipeline (docs/mantleproof.md §5): submit the audit head on-chain
via ``submitAudit(target, severity, rootHash, ipfsCID)``. The contract advances
the linked MantleProofAgent's ``memoryRoot`` internally, so this one call is the
whole on-chain step.

CLAUDE.md invariant: the **oracle-signer key is the only writer** to
``submitAudit``. We sign locally with that key and broadcast a raw tx — the key
never leaves the engine.

The minimal ABI is embedded here on purpose: ``engine/`` is standalone and
containerized separately (CLAUDE.md), so it must NOT read ``../contracts``
artifacts at runtime. ``severity_to_uint8`` is pure / unit-tested; everything
else is live web3 and raises clear errors when un-configured.
"""

from __future__ import annotations

from mantleproof.checks.base import Severity
from mantleproof.settings import get_settings

# IMantleProofRegistry.Severity enum order (Solidity): Info,Low,Medium,High.
_SEVERITY_TO_UINT8: dict[Severity, int] = {
    Severity.INFO: 0,
    Severity.LOW: 1,
    Severity.MEDIUM: 2,
    Severity.HIGH: 3,
}

# Only the function we call; full ABI lives with the contracts package.
REGISTRY_ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "target", "type": "address"},
            {"internalType": "uint8", "name": "severity", "type": "uint8"},
            {"internalType": "bytes32", "name": "rootHash", "type": "bytes32"},
            {"internalType": "string", "name": "ipfsCID", "type": "string"},
        ],
        "name": "submitAudit",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    }
]


def severity_to_uint8(severity: Severity) -> int:
    """Pure: map our Severity to the on-chain IMantleProofRegistry.Severity."""
    return _SEVERITY_TO_UINT8[severity]


def anchor_audit(
    target: str,
    severity: Severity,
    root_hash: bytes,
    ipfs_cid: str,
    *,
    rpc_url: str | None = None,
    registry_address: str | None = None,
    private_key: str | None = None,
    timeout: float = 120.0,
) -> str:
    """Sign + broadcast ``submitAudit`` as the oracle signer; return the txHash.

    Raises ``RuntimeError`` with an actionable message when the signer key or
    registry address is not configured (an unanchored audit must fail loudly,
    never silently drop the on-chain step).
    """
    if len(root_hash) != 32:
        raise ValueError(f"rootHash must be 32 bytes, got {len(root_hash)}")

    s = get_settings()
    rpc_url = rpc_url or s.active_rpc_url
    registry_address = registry_address or s.mantleproof_registry_address
    private_key = private_key if private_key is not None else s.oracle_signer_private_key
    if not registry_address:
        raise RuntimeError(
            "MANTLEPROOF_REGISTRY_ADDRESS not set — cannot anchor the audit. "
            "Copy it from contracts/deployments/<network>.addresses.json."
        )
    if not private_key:
        raise RuntimeError(
            "ORACLE_SIGNER_PRIVATE_KEY not set — the oracle signer is the only "
            "writer to submitAudit (CLAUDE.md). Cannot anchor the audit."
        )

    from web3 import Web3

    w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": timeout}))
    acct = w3.eth.account.from_key(private_key)
    registry = w3.eth.contract(
        address=Web3.to_checksum_address(registry_address), abi=REGISTRY_ABI
    )
    tx = registry.functions.submitAudit(
        Web3.to_checksum_address(target),
        severity_to_uint8(severity),
        root_hash,
        ipfs_cid,
    ).build_transaction(
        {
            "from": acct.address,
            "nonce": w3.eth.get_transaction_count(acct.address),
            "chainId": w3.eth.chain_id,
        }
    )
    signed = acct.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=timeout)
    if receipt.get("status") != 1:
        raise RuntimeError(f"submitAudit reverted: tx={tx_hash.hex()}")
    return tx_hash.hex()
