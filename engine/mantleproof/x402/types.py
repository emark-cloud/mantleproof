"""x402 v1 typed payloads (T11).

Mirrors the on-the-wire shapes from https://www.x402.org/ — both halves of the
402 dance:

  PaymentRequirements (server → client, inside the 402 body's ``accepts`` array)
  PaymentPayload      (client → server, base64 of JSON in the ``X-PAYMENT`` header)

The dataclasses are intentionally close to the JSON: ``to_dict`` / ``from_dict``
are the only conversion seams. Strings stay strings (not ``int`` / ``bytes``) so
they round-trip through base64+JSON byte-for-byte and the facilitator sees the
exact bytes the client signed.

CLAUDE.md cross-chain rule: payment chain is **Base (eip155:8453)**, audit
anchor chain is **Mantle (eip155:5000)**. Network here is the *payment* leg.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class Eip3009Authorization:
    """EIP-3009 ``transferWithAuthorization`` payload (gasless USDC transfer)."""

    from_: str  # ``from`` is a Python keyword — JSON key restored in to_dict
    to: str
    value: str  # base-units (USDC has 6 decimals); kept as decimal string
    validAfter: str  # unix seconds, decimal string
    validBefore: str  # unix seconds, decimal string
    nonce: str  # 32-byte hex, 0x-prefixed

    def to_dict(self) -> dict[str, str]:
        d = asdict(self)
        d["from"] = d.pop("from_")
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Eip3009Authorization:
        return cls(
            from_=str(d["from"]),
            to=str(d["to"]),
            value=str(d["value"]),
            validAfter=str(d["validAfter"]),
            validBefore=str(d["validBefore"]),
            nonce=str(d["nonce"]),
        )


@dataclass(frozen=True)
class ExactEvmPayload:
    """The ``payload`` field of a scheme=exact, network=base PaymentPayload."""

    signature: str  # 0x-prefixed 65-byte sig over the EIP-712 typed data
    authorization: Eip3009Authorization

    def to_dict(self) -> dict[str, Any]:
        return {"signature": self.signature, "authorization": self.authorization.to_dict()}

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> ExactEvmPayload:
        return cls(
            signature=str(d["signature"]),
            authorization=Eip3009Authorization.from_dict(d["authorization"]),
        )


@dataclass(frozen=True)
class PaymentPayload:
    """Top-level X-PAYMENT body (base64-encoded JSON of this)."""

    x402Version: int
    scheme: str  # "exact"
    network: str  # "base"
    payload: ExactEvmPayload

    def to_dict(self) -> dict[str, Any]:
        return {
            "x402Version": self.x402Version,
            "scheme": self.scheme,
            "network": self.network,
            "payload": self.payload.to_dict(),
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> PaymentPayload:
        return cls(
            x402Version=int(d["x402Version"]),
            scheme=str(d["scheme"]),
            network=str(d["network"]),
            payload=ExactEvmPayload.from_dict(d["payload"]),
        )


@dataclass(frozen=True)
class PaymentRequirements:
    """One entry inside the 402 body's ``accepts`` array.

    ``maxAmountRequired`` is in token base units (USDC: 6 decimals → "500000"
    means 0.50 USDC). ``extra`` carries the EIP-712 domain pieces the client
    needs to sign the authorization (USDC name + version on Base).
    """

    scheme: str
    network: str
    maxAmountRequired: str
    resource: str
    description: str
    mimeType: str
    payTo: str
    maxTimeoutSeconds: int
    asset: str
    extra: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class FourOhTwoBody:
    """Body of the 402 response — the server-side half of the protocol."""

    x402Version: int
    error: str
    accepts: list[PaymentRequirements]

    def to_dict(self) -> dict[str, Any]:
        return {
            "x402Version": self.x402Version,
            "error": self.error,
            "accepts": [a.to_dict() for a in self.accepts],
        }
