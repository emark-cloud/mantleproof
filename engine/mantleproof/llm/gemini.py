"""GeminiProvider — DEFAULT, the only provider exercised in CI.

Tune the Tier 2 prompt against Gemini from W3 day 1 (CLAUDE.md risk note).
SCAFFOLD: structure in place; wire google-genai client in T14.
"""

from __future__ import annotations

from mantleproof.settings import get_settings


class GeminiProvider:
    name = "gemini"

    def __init__(self, model: str = "gemini-2.5-pro") -> None:
        self._model = model
        self._api_key = get_settings().gemini_api_key

    def reason(self, prompt: str, system: str) -> str:
        # TODO(T14): from google import genai; client = genai.Client(api_key=...)
        #            return client.models.generate_content(...).text
        raise NotImplementedError("SCAFFOLD: GeminiProvider.reason (T14)")
