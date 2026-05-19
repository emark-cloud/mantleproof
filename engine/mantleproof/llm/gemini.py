"""GeminiProvider — DEFAULT provider, the only one exercised live in CI.

Uses the unified `google-genai` SDK. `reason()` returns RAW TEXT only — no
structured/tool-use output — so the Tier 2 parser + hallucination guard stay
provider-agnostic (CLAUDE.md). Tune the Tier 2 prompt against Gemini from
W3 day 1 (CLAUDE.md risk note).
"""

from __future__ import annotations

from mantleproof.llm.provider import ProviderError, require_key
from mantleproof.settings import get_settings


class GeminiProvider:
    name = "gemini"

    def __init__(self, model: str = "gemini-2.5-pro") -> None:
        self._model = model
        self._api_key = get_settings().gemini_api_key

    def reason(self, prompt: str, system: str) -> str:
        key = require_key(self._api_key, "Gemini", "GEMINI_API_KEY")
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=key)
        try:
            resp = client.models.generate_content(
                model=self._model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    temperature=0.0,  # determinism: same contract → same finding
                ),
            )
        except Exception as e:  # noqa: BLE001 — normalise SDK errors, hide key
            raise ProviderError(f"Gemini request failed: {type(e).__name__}") from e
        return resp.text or ""
