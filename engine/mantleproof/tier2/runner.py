"""Tier 2 runner — resolve inputs, build the prompt, call the provider.

Orchestration only: resolve verified source (T9) + bytecode (RPC) + the
Tier-1 union, load skills, build the tightly-scoped prompt, and get the
provider's RAW TEXT back. Parsing + the hallucination guard are T18 — this
returns the pre-guard artifact (`raw_text`) plus the inputs the guard needs to
verify claims against (source, bytecode, tier1).

Testable offline: pass `source`/`bytecode`/`provider` to skip all network.
"""

from __future__ import annotations

from typing import Any

from mantleproof.llm.provider import LLMProvider, get_provider
from mantleproof.settings import get_settings
from mantleproof.tier1 import run_tier1
from mantleproof.tier2.prompt import build_prompt, load_skills


def run_tier2(
    address: str,
    *,
    chain_id: int = 5000,
    source: str | None = None,
    contract_name: str = "",
    bytecode: bytes | None = None,
    provider: LLMProvider | None = None,
    deployer_history: list[str] | None = None,
) -> dict[str, Any]:
    """Run the Tier-2 reasoning pass for `address`.

    Returns a pre-guard artifact dict. `status` is ``"ok"`` or
    ``"unverified_source"`` (Tier 2 needs verified source to ground claims).
    """
    # 1. resolve verified source (live only if not supplied)
    if source is None:
        from mantleproof.source.mantlescan import MantlescanClient

        src = MantlescanClient(chain_id).get_source(address)
        if src is None or not src.verified:
            return {
                "status": "unverified_source",
                "address": address,
                "chain_id": chain_id,
            }
        source = src.flat()
        contract_name = contract_name or src.name

    # 2. best-effort bytecode (Tier 2 reasons source-first; RPC is optional)
    if bytecode is None:
        from mantleproof.source.rpc import get_code

        try:
            bytecode = get_code(address, get_settings().mantle_rpc_url)
        except Exception:  # noqa: BLE001 — degrade, do not abort the audit
            bytecode = b""

    # 3. Tier-1 union (self-target guard via address) + skills
    tier1 = run_tier1(source, bytecode, chain_id, address=address)
    skills = load_skills()

    # 4. tightly-scoped prompt → provider RAW TEXT (no structured output)
    system, user = build_prompt(
        source,
        bytecode,
        tier1,
        deployer_history,
        skills=skills,
        contract_name=contract_name,
    )
    provider = provider or get_provider()
    raw_text = provider.reason(user, system)

    return {
        "status": "ok",
        "address": address,
        "chain_id": chain_id,
        "provider": provider.name,
        "contract_name": contract_name,
        "tier1": [r.to_dict() for r in tier1],
        "skills_loaded": sorted(skills),
        "system_prompt_chars": len(system),
        "user_prompt_chars": len(user),
        "raw_text": raw_text,  # pre-guard; T18 parses + verifies this
    }
