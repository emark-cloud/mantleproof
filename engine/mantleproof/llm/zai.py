"""ZaiProvider — interface-complete, KEY-GATED, UNTESTED vs the live API.

Z.ai (Zhipu/GLM) is on the judging panel — the adapter ships regardless and
the README credits it (single-env-var swap, `AUDIT_LLM_PROVIDER=zai`). The Z.ai
endpoint is OpenAI-compatible, so this is a thin httpx call (no extra SDK dep).
`reason()` returns RAW TEXT (the assistant message content). Correctness vs the
live API is unverified until ZAI_API_KEY is supplied.
"""

from __future__ import annotations

import httpx

from mantleproof.llm.provider import ProviderError, require_key
from mantleproof.settings import get_settings

_DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4"


class ZaiProvider:
    name = "zai"

    def __init__(
        self,
        model: str = "glm-4.5",
        *,
        base_url: str = _DEFAULT_BASE_URL,
        timeout: float = 60.0,
    ) -> None:
        self._model = model
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._api_key = get_settings().zai_api_key

    def reason(self, prompt: str, system: str) -> str:
        key = require_key(self._api_key, "Z.ai", "ZAI_API_KEY")
        try:
            resp = httpx.post(
                f"{self._base_url}/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": self._model,
                    "temperature": 0.0,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                },
                timeout=self._timeout,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:  # noqa: BLE001 — normalise transport errors, hide key
            raise ProviderError(f"Z.ai request failed: {type(e).__name__}") from e
        choices = data.get("choices") or []
        if not choices:
            return ""
        return choices[0].get("message", {}).get("content", "") or ""
