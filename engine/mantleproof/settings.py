"""Typed settings from the single repo-root .env (see CLAUDE.md)."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    # --- Network ---
    # Default is mainnet now that the cutover gate is cleared (CLAUDE.md §4):
    # contracts deployed on Mantle 5000, all 8 demo audits anchored there.
    # Tests and the Sepolia harness pin `MANTLE_NETWORK=mantleSepolia` explicitly.
    mantle_network: Literal["mantleSepolia", "mantle"] = "mantle"
    mantle_rpc_url: str = "https://rpc.mantle.xyz"
    mantle_sepolia_rpc_url: str = "https://rpc.sepolia.mantle.xyz"

    @property
    def chain_id(self) -> int:
        return 5000 if self.mantle_network == "mantle" else 5003

    @property
    def active_rpc_url(self) -> str:
        if self.mantle_network == "mantle":
            return self.mantle_rpc_url
        return self.mantle_sepolia_rpc_url

    # --- Keys / signer ---
    oracle_signer_private_key: str = ""

    # --- On-chain anchor (engine stays decoupled from the contracts/ layout:
    #     the registry address is read from .env, not contracts/deployments/) ---
    mantleproof_registry_address: str = ""

    # --- ERC-8004 identity tokenId for MantleProof itself (T5; 96 on Mantle
    #     mainnet, 0 on Sepolia where the identity was never re-registered).
    #     Consumed by the T39+ reputation flow when the demo wallet calls
    #     `giveFeedback(<this>, …)` on the official Reputation Registry.
    #     NO `mantleproof_feedback_signer_private_key` setting exists by
    #     design: v2 `giveFeedback` has no signed-auth requirement, so the
    #     engine never needs a feedback signing key (see
    #     `docs/erc8004-abi-notes.md` T37 plan-correction). The payer's own
    #     wallet signs the tx envelope. ---
    mantleproof_agent_token_id: int = 96

    # --- Explorer (Etherscan API V2 — one etherscan.io key, chainId-routed,
    #     covers Mantle 5000 + 5003. V1 mantlescan endpoints are shut down) ---
    etherscan_api_key: str = ""
    mantlescan_api_key: str = ""  # legacy V1 — kept for back-compat, unused by V2

    # --- LLM (Gemini is DEFAULT) ---
    audit_llm_provider: Literal["gemini", "claude", "zai"] = "gemini"
    gemini_api_key: str = ""
    anthropic_api_key: str = ""
    zai_api_key: str = ""

    # --- IPFS ---
    pinata_jwt: str = ""
    ipfs_gateway: str = "https://gateway.pinata.cloud/ipfs/"

    # --- x402 (settles USDC on Base) ---
    # Facilitator selection (verify + settle of the USDC payment leg):
    #   "x402org" — the free x402.org facilitator; **Base Sepolia only** (testnet).
    #   "cdp"     — Coinbase Developer Platform; settles **Base mainnet**. Needs
    #               cdp_api_key_id + cdp_api_key_secret; the CDP host is fixed so
    #               x402_facilitator_url is ignored in this mode.
    x402_facilitator: Literal["x402org", "cdp"] = "x402org"
    x402_facilitator_url: str = "https://x402.org/facilitator"
    cdp_api_key_id: str = ""
    cdp_api_key_secret: str = ""
    base_rpc_url: str = "https://mainnet.base.org"
    x402_payto_address: str = ""
    x402_usdc_address: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
