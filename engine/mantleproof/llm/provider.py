"""LLM provider abstraction.

`reason()` returns RAW TEXT. Parsing + the hallucination guard are
provider-agnostic — never rely on Anthropic tool-use structured output
(CLAUDE.md). Default provider is Gemini (the only CI-tested one).
"""

from __future__ import annotations

from typing import Protocol

from mantleproof.settings import get_settings


class LLMProvider(Protocol):
    name: str

    def reason(self, prompt: str, system: str) -> str:
        """Return the model's raw text response."""
        ...


def get_provider() -> LLMProvider:
    """Factory selected by AUDIT_LLM_PROVIDER (default: gemini)."""
    provider = get_settings().audit_llm_provider
    if provider == "gemini":
        from mantleproof.llm.gemini import GeminiProvider

        return GeminiProvider()
    if provider == "claude":
        from mantleproof.llm.claude import ClaudeProvider

        return ClaudeProvider()
    if provider == "zai":
        from mantleproof.llm.zai import ZaiProvider

        return ZaiProvider()
    raise ValueError(f"Unknown AUDIT_LLM_PROVIDER: {provider!r}")
