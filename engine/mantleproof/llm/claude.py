"""ClaudeProvider — interface-complete, KEY-GATED, UNTESTED vs the live API.

Never on the critical path (Gemini is the default and the only CI-live
provider). Implemented against the `anthropic` SDK and shape-tested with a
mocked client only; correctness vs the live Anthropic API is unverified until
ANTHROPIC_API_KEY is supplied. `reason()` returns RAW TEXT — the concatenated
text blocks — so parsing stays provider-agnostic (CLAUDE.md).
"""

from __future__ import annotations

from mantleproof.llm.provider import ProviderError, require_key
from mantleproof.settings import get_settings


class ClaudeProvider:
    name = "claude"

    def __init__(self, model: str = "claude-sonnet-4-6", max_tokens: int = 4096) -> None:
        self._model = model
        self._max_tokens = max_tokens
        self._api_key = get_settings().anthropic_api_key

    def reason(self, prompt: str, system: str) -> str:
        key = require_key(self._api_key, "Claude", "ANTHROPIC_API_KEY")
        import anthropic

        client = anthropic.Anthropic(api_key=key)
        try:
            msg = client.messages.create(
                model=self._model,
                max_tokens=self._max_tokens,
                system=system,
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as e:  # noqa: BLE001 — normalise SDK errors, hide key
            raise ProviderError(f"Claude request failed: {type(e).__name__}") from e
        # Flatten text blocks to raw text (ignore any non-text block types).
        return "".join(
            getattr(block, "text", "") for block in getattr(msg, "content", [])
        )
