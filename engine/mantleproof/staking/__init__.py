"""Reads + cron for the on-chain StakingPool (docs/update.md §3, T43).

The engine never *writes* to StakingPool directly — the registry's
``submitAudit`` forwards Tier 2 stake on the way in, and ``resolveDispute``
triggers slashing on the way out. This module provides:

- ``read_stake(rootHash)`` — view the current Stake struct (mirror of
  ``OnChainAudit`` discipline: pure decode + live RPC seam).
- ``unlock_cron`` — walks known stakes past their unlock window and calls
  ``StakingPool.unlock(rootHash)`` (permissionless, anyone can call). Run
  via ``engine/scripts/stake_admin.py``.

CLAUDE.md invariant: the oracle-signer key is not required to call
``unlock()`` (it is permissionless), but in practice we call it from the
oracle for operational simplicity.
"""
