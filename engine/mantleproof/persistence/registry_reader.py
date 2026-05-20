"""Web3.py reader — `getAudit(target)` against `MantleProofRegistry` (T7/T24).

Public read path. Counterpart of ``persistence/anchor.py``: same ABI surface,
same engine-vs-contracts decoupling (CLAUDE.md — engine is standalone and must
NOT read ``../contracts`` artifacts at runtime).

The pure pieces (``severity_from_uint8``, ``decode_audit_tuple``) are unit-tested
offline; ``read_audit`` is the live RPC seam and degrades cleanly when the
target has never been audited (``getAudit`` reverts ``UnknownTarget`` → we
translate to ``None`` so the route can return 404 honestly).
"""

from __future__ import annotations

from dataclasses import dataclass

from mantleproof.checks.base import Severity
from mantleproof.settings import get_settings

# Mirror of IMantleProofRegistry.Severity (Solidity enum order: Info,Low,Medium,High).
_UINT8_TO_SEVERITY: dict[int, Severity] = {
    0: Severity.INFO,
    1: Severity.LOW,
    2: Severity.MEDIUM,
    3: Severity.HIGH,
}

# Only the view methods we read; full ABI lives with the contracts package.
REGISTRY_READ_ABI = [
    {
        "inputs": [{"internalType": "address", "name": "target", "type": "address"}],
        "name": "getAudit",
        "outputs": [
            {
                "components": [
                    {"internalType": "bytes32", "name": "rootHash", "type": "bytes32"},
                    {"internalType": "uint8", "name": "severity", "type": "uint8"},
                    {"internalType": "string", "name": "ipfsCID", "type": "string"},
                    {"internalType": "uint64", "name": "timestamp", "type": "uint64"},
                    {"internalType": "address", "name": "submitter", "type": "address"},
                ],
                "internalType": "struct IMantleProofRegistry.Report",
                "name": "",
                "type": "tuple",
            }
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "address", "name": "target", "type": "address"}],
        "name": "isAudited",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "address", "name": "target", "type": "address"}],
        "name": "auditCount",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "oracleSigner",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function",
    },
]


@dataclass(frozen=True)
class OnChainAudit:
    """Decoded ``IMantleProofRegistry.Report`` head."""

    target: str  # checksum address (input echo — not on-chain)
    root_hash: str  # 0x-prefixed 32-byte hex
    severity: Severity
    ipfs_cid: str  # raw cid, no scheme prefix
    timestamp: int  # unix seconds (uint64)
    submitter: str  # checksum address — must equal oracleSigner (invariant)
    audit_count: int


def severity_from_uint8(value: int) -> Severity:
    """Pure: invert the on-chain enum. Raises on out-of-range values."""
    try:
        return _UINT8_TO_SEVERITY[value]
    except KeyError as exc:
        raise ValueError(f"unknown on-chain severity {value!r}") from exc


def decode_audit_tuple(
    target: str,
    raw: tuple[bytes, int, str, int, str] | list,
    *,
    audit_count: int,
) -> OnChainAudit | None:
    """Pure: turn a web3 getAudit() tuple into an OnChainAudit.

    Returns ``None`` when ``rootHash == 0x00..00`` (web3 returns zeros instead
    of reverting in some providers' eth_call paths — keep the route's None-or-
    Audit contract honest either way).
    """
    root_hash_bytes, severity_int, ipfs_cid, timestamp, submitter = raw
    if root_hash_bytes == b"\x00" * 32 or int.from_bytes(root_hash_bytes, "big") == 0:
        return None
    return OnChainAudit(
        target=target,
        root_hash="0x" + bytes(root_hash_bytes).hex(),
        severity=severity_from_uint8(int(severity_int)),
        ipfs_cid=str(ipfs_cid),
        timestamp=int(timestamp),
        submitter=str(submitter),
        audit_count=int(audit_count),
    )


def read_audit(
    target: str,
    *,
    rpc_url: str | None = None,
    registry_address: str | None = None,
    timeout: float = 30.0,
) -> OnChainAudit | None:
    """Live: call ``getAudit(target)``. Returns ``None`` if never audited.

    Raises ``RuntimeError`` when the registry address is missing — refusing to
    answer rather than silently lying about coverage.
    """
    s = get_settings()
    rpc_url = rpc_url or s.active_rpc_url
    registry_address = registry_address or s.mantleproof_registry_address
    if not registry_address:
        raise RuntimeError(
            "MANTLEPROOF_REGISTRY_ADDRESS not set — cannot read audits. "
            "Copy it from contracts/deployments/<network>.addresses.json."
        )

    from web3 import Web3
    from web3.exceptions import ContractLogicError

    w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": timeout}))
    registry = w3.eth.contract(
        address=Web3.to_checksum_address(registry_address), abi=REGISTRY_READ_ABI
    )
    checksum_target = Web3.to_checksum_address(target)

    try:
        raw = registry.functions.getAudit(checksum_target).call()
    except ContractLogicError:
        # UnknownTarget(address) revert == never audited; honest 404 upstream.
        return None
    count = registry.functions.auditCount(checksum_target).call()
    return decode_audit_tuple(checksum_target, raw, audit_count=int(count))


def read_oracle_signer(
    *,
    rpc_url: str | None = None,
    registry_address: str | None = None,
    timeout: float = 30.0,
) -> str:
    """Live: read the immutable ``oracleSigner`` for invariant checks / health."""
    s = get_settings()
    rpc_url = rpc_url or s.active_rpc_url
    registry_address = registry_address or s.mantleproof_registry_address
    if not registry_address:
        raise RuntimeError("MANTLEPROOF_REGISTRY_ADDRESS not set")

    from web3 import Web3

    w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": timeout}))
    registry = w3.eth.contract(
        address=Web3.to_checksum_address(registry_address), abi=REGISTRY_READ_ABI
    )
    return str(registry.functions.oracleSigner().call())
