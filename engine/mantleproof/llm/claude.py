"""ClaudeProvider — interface-complete, KEY-GATED, untested vs live API.

Never relied on for the critical path (Gemini is default). Shape-tested with
mocked transport only. SCAFFOLD — implement in T15.
"""

from __future__ import annotations

from mantleproof.settings import get_settings


class ClaudeProvider:
    name = "claude"

    def __init__(self, model: str = "claude-sonnet-4-6") -> None:
        self._model = model
        self._api_key = get_settings().anthropic_api_key

    def reason(self, prompt: str, system: str) -> str:
        # TODO(T15): anthropic SDK; return messages.create(...).content[0].text (raw text).
        raise NotImplementedError("SCAFFOLD: ClaudeProvider.reason (T15) — key-gated")
