"""Typed settings from the single repo-root .env (see CLAUDE.md)."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    # --- Network (testnet-first) ---
    mantle_network: Literal["mantleSepolia", "mantle"] = "mantleSepolia"
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

    # --- Explorer (Etherscan API V2 — one etherscan.io key, chainId-routed,
    #     covers Mantle 5000 + 5003. V1 mantlescan endpoints are shut down) ---
    etherscan_api_key: str = ""
    mantlescan_api_key: str = ""  # legacy V1 — kept for back-compat, unused by V2

    # --- LLM (Gemini is DEFAULT) ---
    audit_llm_provider: Literal["gemini", "claude", "zai"] = "gemini"
    gemini_api_key: str = ""
    anthropic_api_key: str = ""
    zai_api_key: str = ""

    # --- Persistence ---
    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/mantleproof"
    redis_url: str = "redis://localhost:6379/0"

    # --- IPFS ---
    pinata_jwt: str = ""
    ipfs_gateway: str = "https://gateway.pinata.cloud/ipfs/"

    # --- x402 (settles USDC on Base) ---
    x402_facilitator_url: str = "https://x402.org/facilitator"
    base_rpc_url: str = "https://mainnet.base.org"
    x402_payto_address: str = ""
    x402_usdc_address: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
