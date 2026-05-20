"""Pure builders for the x402 v1 server-side half (T11).

``build_payment_requirements`` and ``build_402_body`` are pure functions used by
the route handler. No network, no I/O — they exist to be unit-testable and
deterministic so the wire shape stays stable.
"""

from __future__ import annotations

from mantleproof.x402.types import FourOhTwoBody, PaymentRequirements

# Canonical USDC contract on Base mainnet (eip155:8453). The token has 6
# decimals — 500000 = 0.50 USDC.
USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

# x402 v1 fixed values for the only scheme/network we accept (CLAUDE.md: USDC
# on Base; Mantle facilitator is roadmap, not hackathon scope).
SCHEME = "exact"
NETWORK = "base"

# Tier-2 audit price = 0.50 USDC (matches MantleProofLicense.payForAudit on
# Mantle, just paid through a different rail). 6-dec base units.
TIER2_PRICE_BASE_UNITS = "500000"

DEFAULT_TIMEOUT_SECS = 60

# EIP-712 domain pieces for the Base-mainnet USDC token. Required by the
# client to assemble the typed-data hash before signing transferWithAuthorization.
USDC_EIP712_EXTRA: dict[str, str] = {"name": "USD Coin", "version": "2"}


def build_payment_requirements(
    *,
    target: str,
    pay_to: str,
    resource_path: str,
    amount_base_units: str = TIER2_PRICE_BASE_UNITS,
    asset: str = USDC_BASE_MAINNET,
    timeout_secs: int = DEFAULT_TIMEOUT_SECS,
) -> PaymentRequirements:
    """Pure: assemble the one PaymentRequirements we offer.

    ``resource_path`` is the absolute URL path of the gated route (``resource``
    in the x402 v1 spec); it's echoed back so the client can confirm what it's
    paying for.
    """
    return PaymentRequirements(
        scheme=SCHEME,
        network=NETWORK,
        maxAmountRequired=amount_base_units,
        resource=resource_path,
        description=f"MantleProof Tier-2 audit of {target} (anchored on Mantle eip155:5000)",
        mimeType="application/json",
        payTo=pay_to,
        maxTimeoutSeconds=timeout_secs,
        asset=asset,
        extra=dict(USDC_EIP712_EXTRA),
    )


def build_402_body(
    *,
    target: str,
    pay_to: str,
    resource_path: str,
    error: str = "X-PAYMENT header is required",
) -> FourOhTwoBody:
    """Pure: full body of the 402 response — protocol header + the one accept."""
    return FourOhTwoBody(
        x402Version=1,
        error=error,
        accepts=[
            build_payment_requirements(
                target=target, pay_to=pay_to, resource_path=resource_path
            )
        ],
    )
