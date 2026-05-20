"""Pure parser for the X-PAYMENT header (T11).

The client puts a base64-encoded JSON ``PaymentPayload`` in the ``X-PAYMENT``
header. We decode + validate before passing to the facilitator — the
facilitator's ``/verify`` will catch most things, but cheap rejection of
malformed input keeps the route honest and gives the client a useful 4xx
instead of a 5xx-from-facilitator.

Returns ``(payload, None)`` on success or ``(None, error_string)`` on failure;
never raises. The route turns the error into a 402-with-clear-reason.
"""

from __future__ import annotations

import base64
import binascii
import json

from mantleproof.x402.types import PaymentPayload

# We only accept exact/base — the same scheme/network we offered in the 402.
ACCEPTED_SCHEME = "exact"
ACCEPTED_NETWORK = "base"
ACCEPTED_X402_VERSION = 1


def parse_payment_header(b64: str) -> tuple[PaymentPayload | None, str | None]:
    """Pure: base64-decode → JSON-load → validate → ``PaymentPayload``.

    The function deliberately rejects mismatching scheme/network/version with
    actionable errors so the client knows whether it formatted the dance
    wrong or hit the wrong endpoint.
    """
    if not b64:
        return None, "X-PAYMENT header is empty"

    try:
        decoded = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        return None, f"X-PAYMENT is not valid base64: {exc}"

    try:
        raw = json.loads(decoded)
    except json.JSONDecodeError as exc:
        return None, f"X-PAYMENT did not base64-decode to JSON: {exc}"
    if not isinstance(raw, dict):
        return None, "X-PAYMENT JSON must be an object"

    version = raw.get("x402Version")
    if version != ACCEPTED_X402_VERSION:
        return None, (
            f"x402Version {version!r} not supported (this endpoint accepts only "
            f"{ACCEPTED_X402_VERSION})"
        )
    if raw.get("scheme") != ACCEPTED_SCHEME:
        return None, f"scheme must be {ACCEPTED_SCHEME!r}, got {raw.get('scheme')!r}"
    if raw.get("network") != ACCEPTED_NETWORK:
        return None, f"network must be {ACCEPTED_NETWORK!r}, got {raw.get('network')!r}"
    if not isinstance(raw.get("payload"), dict):
        return None, "payload must be an object"

    inner = raw["payload"]
    if "signature" not in inner or not isinstance(inner["signature"], str):
        return None, "payload.signature missing or not a string"
    auth = inner.get("authorization")
    if not isinstance(auth, dict):
        return None, "payload.authorization must be an object"
    required = ("from", "to", "value", "validAfter", "validBefore", "nonce")
    missing = [k for k in required if k not in auth]
    if missing:
        return None, f"payload.authorization missing fields: {missing}"

    try:
        payload = PaymentPayload.from_dict(raw)
    except (KeyError, ValueError, TypeError) as exc:
        return None, f"X-PAYMENT shape invalid: {exc}"
    return payload, None
