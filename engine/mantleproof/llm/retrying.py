"""RetryingGemini — survives transient Gemini ServerError (503).

Wraps GeminiProvider with exponential backoff on `gemini-2.5-pro`, then falls
back to `gemini-2.5-flash`. Lifted out of `scripts/validate_tier2.py` so the
live pipeline harnesses (T20 Sepolia + T26 mainnet) can share it -- the same
upstream flakiness that the validation harness already documented breaks
the end-to-end demo flow otherwise.

Satisfies the `LLMProvider` Protocol via duck typing (`name` + `reason()`).
Provider-agnostic by design: parsing + the hallucination guard still operate
on `reason()`'s raw text -- this wrapper changes resilience, not output shape.
"""

from __future__ import annotations

import time

from mantleproof.llm.gemini import GeminiProvider
from mantleproof.llm.provider import ProviderError


class RetryingGemini:
    """LLMProvider that survives transient Gemini 503s.

    Tries `gemini-2.5-pro` with exponential backoff (3 attempts), then falls
    back to `gemini-2.5-flash` (3 attempts). `model_used` records which model
    actually answered so harness reports can surface it.
    """

    name = "gemini"

    def __init__(self) -> None:
        self._pro = GeminiProvider("gemini-2.5-pro")
        self._flash = GeminiProvider("gemini-2.5-flash")
        self.model_used = ""

    def reason(self, prompt: str, system: str) -> str:
        last: Exception | None = None
        for provider, model in (
            (self._pro, "gemini-2.5-pro"),
            (self._flash, "gemini-2.5-flash"),
        ):
            for attempt in range(3):
                try:
                    out = provider.reason(prompt, system)
                    self.model_used = model
                    return out
                except ProviderError as e:  # transient upstream — back off
                    last = e
                    wait = 5 * (2**attempt)
                    print(
                        f"    {model} attempt {attempt + 1} failed "
                        f"({e}); retry in {wait}s",
                        flush=True,
                    )
                    time.sleep(wait)
        raise last or ProviderError(
            "Gemini exhausted retries + flash fallback",
        )
