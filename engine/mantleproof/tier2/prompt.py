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
   "suggested_fix":"<concrete fix>"}
- EVERY $, %, hex literal, and 0x-address in finding/suggested_fix MUST be
  grounded: cite the exact numbered source line (L<n>) it comes from, or a
  bytecode offset. Unverifiable quantitative claims are masked [unsupported]
  and the finding's honesty label is dropped one tier — so do NOT invent
  addresses, dollar amounts, or percentages. If you cannot ground a number,
  omit the number.
- Prefer ESTIMATED unless the evidence is exact. Be conservative; a smaller
  set of well-grounded findings beats speculation.
- If there are no additional bugs, return exactly [].
""".replace("__CID__", TIER2_CHECK_ID)


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


def build_prompt(
    source: str,
    bytecode: bytes,
    tier1: list[CheckResult],
    deployer_history: list[str] | None = None,
    *,
    skills: dict[str, str] | None = None,
    contract_name: str = "",
) -> tuple[str, str]:
    """Return `(system, user)`. Pure given `skills` (else loads bundled briefs)."""
    if skills is None:
        skills = load_skills()
    tier1_json = json.dumps([r.to_dict() for r in tier1], indent=2)
    skills_block = "\n\n".join(f"--- skill:{n} ---\n{txt}" for n, txt in skills.items())
    history = deployer_history or []
    history_block = "\n".join(f"- {h}" for h in history) if history else "(not provided)"

    user = f"""\
# TARGET CONTRACT
name: {contract_name or "(unknown)"}

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

Return the JSON array of ADDITIONAL findings now.
"""
    return _SYSTEM, user
