"""Tier 2 prompt builder + skills loader.

A *tightly scoped* prompt is a credibility lever: the more the model is forced
to cite a concrete source line / bytecode offset for every quantitative claim,
the fewer claims the hallucination guard (T18) has to mask (CLAUDE.md risk
note). Output is constrained to JSON only so parsing stays provider-agnostic —
never tool-use structured output.

`build_prompt` is pure given `skills`; `load_skills` reads the bundled
markdown briefs (deterministic, offline).
"""

from __future__ import annotations

import json
import pathlib

from mantleproof.checks.base import CheckResult

_SKILLS_DIR = pathlib.Path(__file__).resolve().parent.parent / "skills"

# Tier-2 findings carry this id; the guard verifies their claims like any other.
TIER2_CHECK_ID = "tier2_reasoning_v1"

_SYSTEM = """\
You are MantleProof's Tier-2 auditor for Mantle ecosystem-integration bugs
(USDY/mUSD, mETH/cmETH, USDe/sUSDe, Merchant Moe Liquidity Book, Uniswap V3,
EIP-712 replay). Tier-1 heuristic findings are given to you.

Your job: identify ADDITIONAL integration bugs the Tier-1 checks missed. Do not
restate Tier-1 findings.

Hard rules:
- Output JSON ONLY: a JSON array (possibly empty []). No prose, no markdown.
- Each element:
  {"check_id":"__CID__",
   "severity":"high|medium|low|info",
   "label":"VERIFIED|COMPUTED|ESTIMATED|EMULATED|LABELED",
   "finding":"<one specific bug>",
   "evidence":{"source_line":"L<n>" or "bytecode_offset":"0x<hex>",
               "matched_pattern":"<short tag>"},
   "suggested_fix":"<concrete fix>",
   "caveat":"<optional; REQUIRED when you downgraded under the do-not-flag
             allowlist; <=200 chars, name the documented pattern>"}
- EVERY $, %, hex literal, and 0x-address in finding/suggested_fix MUST be
  grounded: cite the exact numbered source line (L<n>) it comes from, or a
  bytecode offset. Unverifiable quantitative claims are masked [unsupported]
  and the finding's honesty label is dropped one tier — so do NOT invent
  addresses, dollar amounts, or percentages. If you cannot ground a number,
  omit the number.

Severity rubric (industry standard — Sherlock / Code4rena / OpenZeppelin /
Immunefi):
- HIGH: direct loss or theft of funds via a CONCRETE, named exploit path.
  Quantify the loss. No hand-wavy hypotheticals.
- MEDIUM: loss contingent on a specific state/condition, OR an invariant
  breach that blocks the protocol's promised value. You MUST name the
  attack path.
- LOW: unintended deviation from spec causing minor loss or quality issue.
- INFO: design observation, gas opt, no risk to correctness or solvency.
Bias rule: if you cannot articulate BOTH (a) a concrete exploit path AND
(b) a loss vector, drop the finding one tier. A smaller set of grounded
MEDIUMs beats a pile of speculative HIGHs.

- Prefer ESTIMATED unless the evidence is exact. Be conservative; a smaller
  set of well-grounded findings beats speculation.
- If there are no additional bugs, return exactly [].
""".replace("__CID__", TIER2_CHECK_ID)


# Dispute re-audit system prompt (used when the user block carries
# ORIGINAL_AUDIT + COUNTER_CLAIM blocks per docs/update.md §2.4). Same
# hallucination-guard discipline as the canonical Tier 2 system, but the
# output contract is a single JSON OBJECT (verdict), not an array.
_DISPUTE_SYSTEM = """\
You are MantleProof's Tier-2 auditor evaluating a DISPUTE against a
previously-published finding. Tier-1 heuristic findings, the ORIGINAL
audit's disputed finding, and the disputer's COUNTER-CLAIM are given to you.

Your job: judge whether the counter-claim invalidates the original finding.

Hard rules:
- Output JSON ONLY: a single JSON OBJECT (NOT an array). No prose, no markdown.
- The object MUST have this exact shape:
  {"outcome":"DISMISSED|AMENDED|RETRACTED",
   "rationale":"<one sentence explaining the verdict>",
   "amended_finding":<finding object — REQUIRED when outcome=AMENDED, omit otherwise>,
   "evidence":{"source_line":"L<n>","matched_pattern":"<short tag>"}}
- EVERY $, %, hex literal, and 0x-address in `rationale`/`amended_finding`
  MUST be grounded: cite the exact numbered source line (L<n>) or bytecode
  offset. Unverifiable quantitative claims are masked [unsupported] and the
  finding's honesty label drops one tier — so do NOT invent addresses,
  dollar amounts, or percentages. If you cannot ground a number, omit it.

Outcome rubric:
- DISMISSED: counter-claim does NOT invalidate the finding. The original
  stands as published. Honesty label of the original UPGRADES one tier
  engine-side (the dispute attempt strengthens the original by failing to
  rebut it).
- AMENDED: counter-claim partially invalidates the finding. Provide
  `amended_finding` with the same shape as a Tier 2 finding
  ({check_id,severity,label,finding,evidence,suggested_fix,caveat}).
  Severity may downgrade; honesty label drops one tier engine-side.
- RETRACTED: counter-claim invalidates the finding entirely. The audit's
  2 MNT stake transfers to the disputer on-chain via slashByDispute. Only
  retract if the counter-claim provides a CONCRETE, citable reason the
  finding's premise is wrong.

Bias rule (mirrors canonical Tier 2): if the counter-claim is weak,
ungrounded, or addresses a different bug than the one disputed, DISMISS.
A conservative DISMISSED beats a speculative RETRACTED.

This is a dispute resolution, NOT a fresh audit. Do NOT produce new
findings; produce ONE verdict object.
"""


def load_skills(only: set[str] | None = None) -> dict[str, str]:
    """Load bundled skill briefs as {name: markdown}. `only` filters by stem."""
    out: dict[str, str] = {}
    for p in sorted(_SKILLS_DIR.glob("*.md")):
        if only is None or p.stem in only:
            out[p.stem] = p.read_text()
    return out


def number_source(source: str) -> str:
    """Prefix each line with `L<n>|` so the model can cite exact lines and the
    guard (T18) can resolve a cited line back to its text."""
    return "\n".join(
        f"L{i}|{line}" for i, line in enumerate(source.splitlines(), start=1)
    )


def _bytecode_view(bytecode: bytes, *, limit: int = 4000) -> str:
    if not bytecode:
        return "(bytecode unavailable)"
    hexstr = bytecode.hex()
    total = len(bytecode)
    head = hexstr[: limit * 2]
    note = "" if len(hexstr) <= limit * 2 else f"\n… (truncated; {total} bytes total)"
    return f"0x{head}{note}\n(offsets above are byte offsets into runtime bytecode)"


def _reaudit_block(original_audit: dict, counter_claim: dict, finding_index: int) -> str:
    """Format the original audit + counter-claim for a dispute re-audit prompt.

    Pure / network-free. Truncates the disputer's free-text claim to 4 kB to
    keep the prompt bounded — the full IPFS document is still referenced by CID
    so the model knows it was given a summary.
    """
    cid = counter_claim.get("cid") or counter_claim.get("ipfs_cid") or "(no cid)"
    claim_text = str(counter_claim.get("claim") or counter_claim.get("text") or "")[:4000]
    findings = original_audit.get("findings", [])
    disputed = {}
    if 0 <= finding_index < len(findings):
        disputed = findings[finding_index]
    original_json = json.dumps(disputed, indent=2)
    return f"""\
# ORIGINAL AUDIT — disputed finding (index {finding_index})
{original_json}

# COUNTER-CLAIM (filed by the disputer, IPFS CID: {cid})
{claim_text}

# DISPUTE RE-AUDIT INSTRUCTIONS
You are re-evaluating the ORIGINAL FINDING above in light of the COUNTER-CLAIM.
Same evidence rules apply: every quantitative claim must cite L<n> or
bytecode_offset; ungrounded literals are masked [unsupported] and the honesty
label drops one tier.

Return EXACTLY ONE JSON object (NOT an array):
{{"outcome":"DISMISSED|AMENDED|RETRACTED",
  "rationale":"<one sentence explaining the verdict>",
  "amended_finding":<finding object — REQUIRED when outcome=AMENDED, omit otherwise>,
  "evidence":{{"source_line":"L<n>","matched_pattern":"<short tag>"}}}}

Outcome rubric:
- DISMISSED: counter-claim does not invalidate the finding. Honesty label of
  the original finding upgrades one tier engine-side.
- AMENDED: counter-claim partially invalidates the finding. Provide
  `amended_finding` with the same shape as the original (severity may
  downgrade; honesty label drops one tier engine-side).
- RETRACTED: counter-claim invalidates the finding entirely. Stake transfers
  to the disputer on-chain.

Be conservative. If the counter-claim is weak or ungrounded, DISMISS.
"""


def build_prompt(
    source: str,
    bytecode: bytes,
    tier1: list[CheckResult],
    deployer_history: list[str] | None = None,
    *,
    skills: dict[str, str] | None = None,
    contract_name: str = "",
    original_audit: dict | None = None,
    counter_claim: dict | None = None,
    finding_index: int = 0,
) -> tuple[str, str]:
    """Return `(system, user)`. Pure given `skills` (else loads bundled briefs).

    When ``original_audit`` and ``counter_claim`` are both set, the user prompt
    gains an ORIGINAL-AUDIT + COUNTER-CLAIM block and the model is asked for a
    single JSON object verdict instead of an array (dispute re-audit path —
    docs/update.md §2.4). The system prompt is unchanged so the hallucination
    guard's claim-extraction (T18) keeps working without modification.
    """
    if skills is None:
        skills = load_skills()
    tier1_json = json.dumps([r.to_dict() for r in tier1], indent=2)
    skills_block = "\n\n".join(f"--- skill:{n} ---\n{txt}" for n, txt in skills.items())
    history = deployer_history or []
    history_block = "\n".join(f"- {h}" for h in history) if history else "(not provided)"
    reaudit_section = ""
    if original_audit is not None and counter_claim is not None:
        reaudit_section = "\n" + _reaudit_block(original_audit, counter_claim, finding_index) + "\n"

    # When the dispute re-audit block is present, swap to the dispute system
    # prompt (asks for a single JSON object). Otherwise use the canonical
    # Tier 2 system prompt (asks for a JSON array). Both prompts share the
    # same hallucination-guard discipline — claim grounding rules unchanged.
    system_prompt = (
        _DISPUTE_SYSTEM
        if original_audit is not None and counter_claim is not None
        else _SYSTEM
    )

    user = f"""\
# TARGET CONTRACT
name: {contract_name or "(unknown)"}
{reaudit_section}
# TIER-1 FINDINGS (already reported — find what these MISSED)
{tier1_json}

# SKILLS BRIEFS (Mantle ecosystem bug patterns)
{skills_block}

# DEPLOYER HISTORY (recent deployments by this deployer)
{history_block}

# CONTRACT SOURCE (line-numbered — cite L<n> in every claim)
{number_source(source)}

# DEPLOYED BYTECODE
{_bytecode_view(bytecode)}

# DO-NOT-FLAG-AS-HIGH: documented-intentional design patterns
The following patterns are EXPLICITLY DOCUMENTED protocol design, not bugs.
If the contract under review implements one of these, you MUST downgrade
the finding (HIGH→LOW, MEDIUM→INFO) AND populate `caveat` with a
one-sentence explanation citing the pattern name:
- wstETH-style non-rebasing wrapper around a rebasing or yield-bearing
  token (constant balance, yield via exchange rate). The wrapper EXISTS
  to break the rebase — that is the feature. Cf. Lido wstETH, Ondo USDYW.
- LayerZero OFT (Omnichain Fungible Token) burning/minting 1:1 across
  chains while the underlying asset accrues yield via exchange-rate on
  the home chain. 1:1 bridging is correct; yield is preserved off-chain.
  Cf. mETH/cmETH, weETH, USDY OFT deployments.
- Admin blacklist / freeze / seizure on a regulated stablecoin or
  staked-stablecoin (USDC-style compliance). Documented compliance powers
  are not centralization bugs at HIGH. Cf. USDC, sUSDe, USDT.
- Owner-upgradeable proxies, pause guardians, and oracle admin setters
  when the protocol documents them as operational controls.
Generic rule: if the protocol's public docs describe the behavior as
intended, downgrade by one tier and explain in `caveat`. Do NOT silently
drop the finding — surface it at the lower tier with the caveat so
reviewers see the design choice.

Return the JSON {("object" if original_audit is not None else "array")} now.
"""
    return system_prompt, user
