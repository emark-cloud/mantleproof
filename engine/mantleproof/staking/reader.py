"""Web3.py read of ``StakingPool.stakeOf(rootHash)`` (docs/update.md §3, T43).

Pure decode (``decode_stake_tuple``) is unit-tested offline; ``read_stake`` is
the live RPC seam and returns ``None`` when the stake is unknown (revert
translated to ``None`` per registry_reader.py convention).
"""

from __future__ import annotations

from dataclasses import dataclass

from mantleproof.settings import get_settings

# Mirror of ``StakingPool.Status``.
STATUS_LOCKED = 0
STATUS_RELEASED = 1
STATUS_SLASHED_DISPUTE = 2
STATUS_SLASHED_EXPLOIT = 3  # reserved, post-hackathon

STAKING_POOL_READ_ABI = [
    {
        "inputs": [{"internalType": "bytes32", "name": "rootHash", "type": "bytes32"}],
        "name": "stakeOf",
        "outputs": [
            {
                "components": [
                    {"internalType": "bytes32", "name": "rootHash", "type": "bytes32"},
                    {"internalType": "address", "name": "auditor", "type": "address"},
                    {"internalType": "uint256", "name": "amount", "type": "uint256"},
                    {"internalType": "uint64", "name": "lockedAt", "type": "uint64"},
                    {"internalType": "uint64", "name": "unlocksAt", "type": "uint64"},
                    {"internalType": "uint8", "name": "status", "type": "uint8"},
                ],
                "internalType": "struct StakingPool.Stake",
                "name": "",
                "type": "tuple",
            }
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "bytes32", "name": "rootHash", "type": "bytes32"}],
        "name": "isLocked",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "bytes32", "name": "rootHash", "type": "bytes32"}],
        "name": "unlock",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "treasury",
        "outputs": [{"internalType": "address payable", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "registry",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function",
    },
]


@dataclass(frozen=True)
class OnChainStake:
    """Decoded ``StakingPool.Stake`` entry."""

    root_hash: str  # 0x-prefixed 32-byte hex
    auditor: str
    amount: int  # wei (0 after SLASHED/RELEASED — amount lives elsewhere)
    locked_at: int  # unix seconds
    unlocks_at: int  # unix seconds (locked_at + 30 days)
    status: int  # 0=LOCKED 1=RELEASED 2=SLASHED_DISPUTE 3=SLASHED_EXPLOIT (reserved)


def decode_stake_tuple(raw: tuple) -> OnChainStake | None:
    """Pure: turn a web3 stakeOf() tuple into an OnChainStake.

    Returns ``None`` on a zero rootHash (unknown stake — some providers swallow
    the revert and zero-fill the response).
    """
    root_hash_bytes, auditor, amount, locked_at, unlocks_at, status = raw
    if root_hash_bytes == b"\x00" * 32 or int.from_bytes(root_hash_bytes, "big") == 0:
        return None
    return OnChainStake(
        root_hash="0x" + bytes(root_hash_bytes).hex(),
        auditor=str(auditor),
        amount=int(amount),
        locked_at=int(locked_at),
        unlocks_at=int(unlocks_at),
        status=int(status),
    )


def read_stake(
    root_hash: bytes | str,
    *,
    rpc_url: str | None = None,
    pool_address: str | None = None,
    timeout: float = 30.0,
) -> OnChainStake | None:
    """Live: ``stakeOf(rootHash)``. ``None`` if never staked."""
    if isinstance(root_hash, str):
        hex_str = root_hash[2:] if root_hash.startswith("0x") else root_hash
        root_hash = bytes.fromhex(hex_str)
    if len(root_hash) != 32:
        raise ValueError(f"rootHash must be 32 bytes, got {len(root_hash)}")

    s = get_settings()
    rpc_url = rpc_url or s.active_rpc_url
    pool_address = pool_address or s.mantleproof_staking_pool_address
    if not pool_address:
        raise RuntimeError(
            "MANTLEPROOF_STAKING_POOL_ADDRESS not set — cannot read stakes. "
            "Copy it from contracts/deployments/<network>.addresses.json."
        )

    from web3 import Web3
    from web3.exceptions import ContractLogicError

    w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": timeout}))
    pool = w3.eth.contract(
        address=Web3.to_checksum_address(pool_address), abi=STAKING_POOL_READ_ABI
    )
    try:
        raw = pool.functions.stakeOf(root_hash).call()
    except ContractLogicError:
        # UnknownStake(bytes32) revert == never staked.
        return None
    return decode_stake_tuple(raw)


def call_unlock(
    root_hash: bytes | str,
    *,
    rpc_url: str | None = None,
    pool_address: str | None = None,
    private_key: str | None = None,
    timeout: float = 120.0,
) -> str:
    """Broadcast ``StakingPool.unlock(rootHash)``. Permissionless on-chain;
    here we sign with the oracle key for operational simplicity.

    Reverts (and we raise) if the unlock window hasn't elapsed.
    """
    if isinstance(root_hash, str):
        hex_str = root_hash[2:] if root_hash.startswith("0x") else root_hash
        root_hash = bytes.fromhex(hex_str)
    if len(root_hash) != 32:
        raise ValueError(f"rootHash must be 32 bytes, got {len(root_hash)}")

    s = get_settings()
    rpc_url = rpc_url or s.active_rpc_url
    pool_address = pool_address or s.mantleproof_staking_pool_address
    private_key = private_key if private_key is not None else s.oracle_signer_private_key
    if not pool_address:
        raise RuntimeError("MANTLEPROOF_STAKING_POOL_ADDRESS not set")
    if not private_key:
        raise RuntimeError("ORACLE_SIGNER_PRIVATE_KEY not set")

    from typing import cast

    from web3 import Web3
    from web3.types import TxParams

    w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": timeout}))
    acct = w3.eth.account.from_key(private_key)
    pool = w3.eth.contract(
        address=Web3.to_checksum_address(pool_address), abi=STAKING_POOL_READ_ABI
    )
    tx = pool.functions.unlock(root_hash).build_transaction(
        cast(
            TxParams,
            {
                "from": acct.address,
                "nonce": w3.eth.get_transaction_count(acct.address),
                "chainId": w3.eth.chain_id,
            },
        )
    )
    signed = acct.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=timeout)
    if receipt.get("status") != 1:
        raise RuntimeError(f"unlock reverted: tx={tx_hash.hex()}")
    return tx_hash.hex()
