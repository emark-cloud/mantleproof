"""ZaiProvider — interface-complete, KEY-GATED, untested vs live API.

Z.ai (Zhipu/GLM) is on the judging panel — the adapter ships regardless and the
README credits it (single-env-var swap). OpenAI-compatible endpoints, so the
adapter is small. SCAFFOLD — implement in T16.
"""

from __future__ import annotations

from mantleproof.settings import get_settings


class ZaiProvider:
    name = "zai"

    def __init__(self, model: str = "glm-4.5") -> None:
        self._model = model
        self._api_key = get_settings().zai_api_key

    def reason(self, prompt: str, system: str) -> str:
        # TODO(T16): OpenAI-compatible client against Z.ai base URL; return raw text.
        raise NotImplementedError("SCAFFOLD: ZaiProvider.reason (T16) — key-gated")
