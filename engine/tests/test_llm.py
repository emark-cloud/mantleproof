"""T13–T16 — LLM provider Protocol, env factory, and the three adapters.

Gemini is the default and the only provider exercised *live* (gated on
GEMINI_API_KEY). Claude/Zai are interface-complete + key-gated and shape-tested
with mocked transport only (CLAUDE.md).
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from mantleproof.llm import provider as P
from mantleproof.llm.claude import ClaudeProvider
from mantleproof.llm.gemini import GeminiProvider
from mantleproof.llm.provider import (
    LLMProvider,
    ProviderError,
    get_provider,
    require_key,
)
from mantleproof.llm.zai import ZaiProvider

# --- T13: Protocol + factory ------------------------------------------------

def test_all_adapters_satisfy_the_protocol():
    for cls in (GeminiProvider, ClaudeProvider, ZaiProvider):
        inst = cls()
        assert isinstance(inst, LLMProvider)
        assert isinstance(inst.name, str) and inst.name


@pytest.mark.parametrize(
    "name,cls",
    [("gemini", GeminiProvider), ("claude", ClaudeProvider), ("zai", ZaiProvider)],
)
def test_factory_selects_by_env(monkeypatch, name, cls):
    monkeypatch.setattr(P, "get_settings", lambda: SimpleNamespace(audit_llm_provider=name))
    assert isinstance(get_provider(), cls)


def test_factory_default_is_gemini(monkeypatch):
    monkeypatch.setattr(
        P, "get_settings", lambda: SimpleNamespace(audit_llm_provider="gemini")
    )
    assert get_provider().name == "gemini"


def test_factory_unknown_raises(monkeypatch):
    monkeypatch.setattr(
        P, "get_settings", lambda: SimpleNamespace(audit_llm_provider="bogus")
    )
    with pytest.raises(ValueError, match="Unknown AUDIT_LLM_PROVIDER"):
        get_provider()


def test_require_key():
    assert require_key("abc", "X", "X_KEY") == "abc"
    with pytest.raises(ProviderError, match="X_KEY is not set"):
        require_key("", "X", "X_KEY")
    with pytest.raises(ProviderError) as ei:
        require_key(None, "X", "X_KEY")
    assert "secret" not in str(ei.value).lower()  # never echoes a value


# --- key-gated behaviour: every adapter fails clearly without its key -------

@pytest.mark.parametrize(
    "cls,env",
    [
        (GeminiProvider, "GEMINI_API_KEY"),
        (ClaudeProvider, "ANTHROPIC_API_KEY"),
        (ZaiProvider, "ZAI_API_KEY"),
    ],
)
def test_missing_key_raises_provider_error(cls, env):
    inst = cls()
    inst._api_key = ""  # simulate unset, regardless of local .env
    with pytest.raises(ProviderError, match=env):
        inst.reason("hi", "sys")


# --- T14: Gemini, mocked transport (always runs, incl. CI) -----------------

def test_gemini_reason_mocked(monkeypatch):
    captured = {}

    class _Resp:
        text = "MOCK GEMINI OUTPUT"

    class _Models:
        def generate_content(self, *, model, contents, config):
            captured.update(model=model, contents=contents, config=config)
            return _Resp()

    class _Client:
        def __init__(self, *, api_key):
            captured["api_key_passed"] = bool(api_key)
            self.models = _Models()

    import google.genai as genai

    monkeypatch.setattr(genai, "Client", _Client)
    p = GeminiProvider(model="gemini-2.5-pro")
    p._api_key = "test-key"
    out = p.reason("audit this", "you are an auditor")
    assert out == "MOCK GEMINI OUTPUT"
    assert captured["model"] == "gemini-2.5-pro"
    assert captured["contents"] == "audit this"
    assert captured["config"].system_instruction == "you are an auditor"
    assert captured["config"].temperature == 0.0
    assert captured["api_key_passed"] is True


# --- T15: Claude, mocked transport -----------------------------------------

def test_claude_reason_mocked_flattens_text_blocks(monkeypatch):
    class _Msg:
        content = [SimpleNamespace(text="part1 "), SimpleNamespace(text="part2")]

    class _Messages:
        def create(self, **kw):
            assert kw["system"] == "sys"
            assert kw["messages"] == [{"role": "user", "content": "p"}]
            return _Msg()

    class _Anthropic:
        def __init__(self, *, api_key):
            self.messages = _Messages()

    import anthropic

    monkeypatch.setattr(anthropic, "Anthropic", _Anthropic)
    c = ClaudeProvider()
    c._api_key = "test-key"
    assert c.reason("p", "sys") == "part1 part2"


# --- T16: Zai, mocked transport (OpenAI-compatible REST) --------------------

def test_zai_reason_mocked(monkeypatch):
    class _Resp:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "ZAI OK"}}]}

    import mantleproof.llm.zai as zmod

    def _post(url, **kw):
        assert url.endswith("/chat/completions")
        assert kw["headers"]["Authorization"] == "Bearer test-key"
        assert kw["json"]["messages"][0]["role"] == "system"
        return _Resp()

    monkeypatch.setattr(zmod.httpx, "post", _post)
    z = ZaiProvider()
    z._api_key = "test-key"
    assert z.reason("p", "sys") == "ZAI OK"


# --- T14: Gemini live (skips when no real key — e.g. CI without the secret) -

def test_gemini_live_smoke():
    from mantleproof.settings import get_settings

    if not get_settings().gemini_api_key:
        pytest.skip("GEMINI_API_KEY not set — live Gemini smoke skipped")
    out = GeminiProvider().reason(
        "Reply with exactly the word: OK", "You are a terse assistant."
    )
    assert isinstance(out, str) and out.strip()
