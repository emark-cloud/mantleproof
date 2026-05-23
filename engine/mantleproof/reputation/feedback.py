"""Pure builders + pre-flight assertions for the ERC-8004 v2 ``giveFeedback`` flow (T39).

The real v2 Reputation Registry is permissionless from the funder's side: any
address that is NOT the agent's owner/operator/approved-address may call
``giveFeedback(agentId, …)`` directly. There is no signed-auth (``feedbackAuth``)
requirement on the deployed contract — see ``docs/erc8004-abi-notes.md`` (T37).
Consequently this module is **pure call-data + pure pre-flight assertions**, no
signing, no key handling, no network. The demo wallet wiring lives in
``engine/scripts/give_feedback_demo.py`` (T40); it signs the tx envelope with
the payer's own private key, never with anything MantleProof controls.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any

from eth_abi.abi import encode
from eth_utils import keccak  # type: ignore[import-untyped]

# ---------------------------------------------------------------------------
# Canonical addresses (per CLAUDE.md "Path A", verified live 2026-05-23 in
# T37). Kept here as a small per-chain map so the demo + verifier scripts
# share a single source of truth that's distinct from `frontend/src/lib/
# contracts.ts` (the frontend deliberately doesn't import from `engine/`).
# Mainnet (5000) is the only target the demo flow actually submits to;
# Sepolia (5003) is included for parity but MantleProof's agentTokenId is 0
# there (T5 was never re-done on testnet).
# ---------------------------------------------------------------------------

REPUTATION_REGISTRY_BY_CHAIN: dict[int, str] = {
    5000: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
    5003: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
}

IDENTITY_REGISTRY_BY_CHAIN: dict[int, str] = {
    5000: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    5003: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
}

# Our own MantleProofLicense (sybil-gate target — we only help addresses that
# actually paid through `payForAudit`). Mirrors `contracts/deployments/*.json`;
# unset for chains we haven't deployed to.
LICENSE_BY_CHAIN: dict[int, str] = {
    5000: "0x906390B3594384bE83F3465cFeDf8661f4d1a410",
    5003: "0x53459fb149CB1772ea389ACE325501DA2B28E437",
}

# Function / event selectors. Kept literal so reviewers can verify with `cast
# sig` / `cast keccak` without running this module.
GIVE_FEEDBACK_SELECTOR = "0x3c036a7e"
"""selector for ``giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)``"""

AUDIT_PAID_TOPIC = "0xdefca826ee1069b69b50da3abfb4091d7fdc91ab45109d16e216dfa6fa04ca07"
"""keccak256 of ``AuditPaid(address,address,uint256)``.

Emitted by ``MantleProofLicense.payForAudit``; drives the T39 sybil gate.
"""

# v2 contract bounds enforced inside `giveFeedback`. Replicated here so we can
# fail loudly client-side before spending gas.
MAX_ABS_VALUE = 10**38
MAX_VALUE_DECIMALS = 18


class FeedbackBuilderError(ValueError):
    """Raised when the requested feedback would be rejected by the contract.

    These are user-input bugs that ``giveFeedback`` would `revert` on; raising
    here pre-flight saves the funder from wasting gas on a hopeless tx.
    """


class SybilGateError(RuntimeError):
    """Pre-flight check that protects MantleProof's reputation surface.

    Distinct from FeedbackBuilderError: this is the operational guardrail we
    apply at the script layer (the chain does NOT enforce it). The on-chain
    reputation signal means "real customer feedback" only because we refuse to
    help random addresses spam it.
    """


# ---------------------------------------------------------------------------
# Pure builder
# ---------------------------------------------------------------------------


def build_give_feedback_calldata(
    *,
    agent_id: int,
    value: int,
    value_decimals: int = 0,
    tag1: str = "",
    tag2: str = "",
    endpoint: str = "",
    feedback_uri: str = "",
    feedback_hash: bytes | str = b"\x00" * 32,
) -> str:
    """Build the ``tx.data`` hex string for an ERC-8004 v2 ``giveFeedback`` call.

    Pure: no I/O, no signing, deterministic for fixed inputs. Validates the
    same bounds the on-chain contract enforces so callers get an immediate
    Python-side error instead of an `eth_call` revert.

    ``agent_id``  — ERC-8004 tokenId being rated (96 for MantleProof).
    ``value``     — signed integer; on-chain bound is |value| ≤ 1e38.
    ``value_decimals`` — fixed-point scale; on-chain bound is ≤ 18.
    ``tag1``/``tag2`` — short categorical tags (e.g. ``"audit-quality"``).
    ``endpoint``     — optional URI of the rated interaction.
    ``feedback_uri`` — optional URI of an off-chain feedback document.
    ``feedback_hash``— optional 32-byte hash of the document referenced by
                      ``feedback_uri``. Accepts ``bytes`` (length 32) or a
                      ``0x``-prefixed 64-char hex string.

    Returns a ``0x``-prefixed hex string suitable for the ``data`` field of
    an ``eth_sendTransaction`` envelope.
    """
    if agent_id < 0 or agent_id >= 2**256:
        raise FeedbackBuilderError(f"agent_id out of uint256 range: {agent_id!r}")
    if value_decimals < 0 or value_decimals > MAX_VALUE_DECIMALS:
        raise FeedbackBuilderError(
            f"value_decimals must be 0..{MAX_VALUE_DECIMALS}, got {value_decimals}"
        )
    if not -MAX_ABS_VALUE <= value <= MAX_ABS_VALUE:
        raise FeedbackBuilderError(
            f"|value| must be <= 1e38, got {value}"
        )
    # int128 bounds — `value` packs into int128 on-chain.
    if not -(2**127) <= value <= 2**127 - 1:
        raise FeedbackBuilderError(f"value exceeds int128 range: {value}")

    fh = _normalize_feedback_hash(feedback_hash)

    payload = encode(
        [
            "uint256",
            "int128",
            "uint8",
            "string",
            "string",
            "string",
            "string",
            "bytes32",
        ],
        [agent_id, value, value_decimals, tag1, tag2, endpoint, feedback_uri, fh],
    )
    return GIVE_FEEDBACK_SELECTOR + payload.hex()


# ---------------------------------------------------------------------------
# Pure pre-flight checks (sybil gate + on-chain authorization gate)
# ---------------------------------------------------------------------------


def assert_paid(
    *,
    payer: str,
    target: str,
    chain_id: int,
    get_logs: Callable[..., Iterable[dict[str, Any]]],
    license_address: str | None = None,
    from_block: int | str = "earliest",
    to_block: int | str = "latest",
) -> dict[str, Any]:
    """Sybil-gate: confirm an ``AuditPaid(payer, target, amount)`` event exists.

    We only help addresses that actually paid via ``MantleProofLicense.payForAudit``
    leave feedback about MantleProof. The chain does NOT enforce this — we do,
    operationally, so the on-chain reputation signal means real customer
    feedback, not random spam.

    ``get_logs`` is dependency-injected (typically ``w3.eth.get_logs``) so this
    function stays pure / unit-testable without a live RPC. Returns the matched
    log dict (newest of any matches); raises ``SybilGateError`` if none found.
    """
    addr = license_address or LICENSE_BY_CHAIN.get(chain_id)
    if not addr:
        raise SybilGateError(
            f"no MantleProofLicense address known for chainId {chain_id}; "
            f"pass license_address explicitly or extend LICENSE_BY_CHAIN"
        )
    payer_topic = _addr_topic(payer)
    target_topic = _addr_topic(target)
    logs = list(
        get_logs(
            {
                "address": addr,
                "fromBlock": from_block,
                "toBlock": to_block,
                "topics": [AUDIT_PAID_TOPIC, payer_topic, target_topic],
            }
        )
    )
    if not logs:
        raise SybilGateError(
            f"no AuditPaid log for payer={payer} target={target} on chainId {chain_id} "
            f"in [{from_block}, {to_block}]; payment is required before feedback "
            f"(MantleProofLicense {addr})"
        )
    return logs[-1]


def assert_paid_via_tx(
    *,
    payer: str,
    target: str,
    chain_id: int,
    get_receipt: Callable[[str], dict[str, Any] | None],
    paid_tx: str,
    license_address: str | None = None,
) -> dict[str, Any]:
    """Sybil-gate variant: confirm an ``AuditPaid`` log inside a specific tx.

    Preferred over :func:`assert_paid` when the caller already knows the
    payment tx hash — avoids any reliance on the RPC's ``eth_getLogs`` range
    limits (many public providers reject ``earliest..latest`` scans). Pure /
    dependency-injected; ``get_receipt`` is typically
    ``w3.eth.get_transaction_receipt``.

    Returns the matched log dict; raises ``SybilGateError`` if the tx
    doesn't exist, didn't succeed, is to a different License address, or
    doesn't contain a matching ``AuditPaid(payer, target, _)`` event.
    """
    addr = license_address or LICENSE_BY_CHAIN.get(chain_id)
    if not addr:
        raise SybilGateError(
            f"no MantleProofLicense address known for chainId {chain_id}; "
            f"pass license_address explicitly or extend LICENSE_BY_CHAIN"
        )
    rcpt = get_receipt(paid_tx)
    if rcpt is None:
        raise SybilGateError(f"no transaction receipt for {paid_tx}")
    if rcpt.get("status") != 1:
        raise SybilGateError(
            f"transaction {paid_tx} did not succeed (status={rcpt.get('status')!r})"
        )

    payer_topic = _addr_topic(payer)
    target_topic = _addr_topic(target)
    for raw in rcpt.get("logs", []):
        log_addr = str(raw.get("address", "")).lower()
        if log_addr != addr.lower():
            continue
        topics = [_topic_to_hex(t) for t in raw.get("topics", [])]
        if len(topics) < 3:
            continue
        if topics[0].lower() != AUDIT_PAID_TOPIC.lower():
            continue
        if topics[1].lower() != payer_topic.lower():
            continue
        if topics[2].lower() != target_topic.lower():
            continue
        return raw
    raise SybilGateError(
        f"transaction {paid_tx} contains no AuditPaid(payer={payer}, target={target}, _) "
        f"event from MantleProofLicense {addr}"
    )


def assert_not_authorized(
    *,
    payer: str,
    agent_id: int,
    is_authorized_or_owner: Callable[[str, int], bool],
) -> None:
    """Mirror the v2 anti-self-feedback gate: refuse if payer is owner/operator.

    The on-chain contract reverts ``"Self-feedback not allowed"`` if
    ``isAuthorizedOrOwner(payer, agentId)`` is true. We pre-flight the same
    check so the demo fails loudly with a clear message before spending gas.
    Dependency-injected so unit tests don't need an RPC.
    """
    if is_authorized_or_owner(payer, agent_id):
        raise SybilGateError(
            f"payer {payer} is the owner/operator/approved-address for agent "
            f"{agent_id}; the v2 Reputation Registry forbids self-feedback "
            f'(reverts "Self-feedback not allowed"). Use a distinct wallet.'
        )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _normalize_feedback_hash(h: bytes | str) -> bytes:
    if isinstance(h, bytes):
        if len(h) != 32:
            raise FeedbackBuilderError(
                f"feedback_hash bytes must be length 32, got {len(h)}"
            )
        return h
    if not h.startswith("0x") or len(h) != 66:
        raise FeedbackBuilderError(
            "feedback_hash hex must be 0x-prefixed and 32 bytes (64 hex chars), "
            f"got {h!r}"
        )
    return bytes.fromhex(h[2:])


def _addr_topic(addr: str) -> str:
    """Indexed-address topic = 32-byte left-padded address, hex-prefixed."""
    if not addr.startswith("0x") or len(addr) != 42:
        raise FeedbackBuilderError(f"address must be 0x-prefixed 20 bytes, got {addr!r}")
    return "0x" + "0" * 24 + addr[2:].lower()


def _topic_to_hex(topic: Any) -> str:
    """Normalise a web3 ``HexBytes`` / ``bytes`` / ``str`` topic to ``0x``-hex."""
    if isinstance(topic, str):
        return topic if topic.startswith("0x") else "0x" + topic
    if isinstance(topic, (bytes, bytearray)):
        return "0x" + bytes(topic).hex()
    # web3 ``HexBytes`` exposes ``.hex()``; fall back via str() otherwise.
    h = getattr(topic, "hex", None)
    if callable(h):
        raw = h()
        s = raw if isinstance(raw, str) else str(raw)
        return s if s.startswith("0x") else "0x" + s
    s = str(topic)
    return s if s.startswith("0x") else "0x" + s


# Mirror of `frontend/src/lib/contracts.ts` `AGENT_TOKEN_ID = 96n`. Re-stated
# here so the engine doesn't reach into the frontend tree.
MANTLEPROOF_AGENT_TOKEN_ID = 96


def feedback_hash_of(content: bytes | str) -> bytes:
    """Convenience: keccak256 of off-chain feedback content.

    Useful when the demo wants to bind ``feedbackHash`` to a specific
    rootHash + decision string without serialising to IPFS first.
    """
    if isinstance(content, str):
        content = content.encode("utf-8")
    return keccak(content)
