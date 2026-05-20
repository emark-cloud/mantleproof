"""x402 paywall — implemented across this package (T11, formerly T22).

The protocol is split into:

  ``x402/types.py``        — typed payloads (PaymentRequirements, PaymentPayload)
  ``x402/builder.py``      — pure 402-body assembly
  ``x402/parser.py``       — pure X-PAYMENT header parser
  ``x402/facilitator.py``  — live ``/verify`` + ``/settle`` HTTP client
  ``api/routes_x402.py``   — route orchestration (verify-before, settle-after)

This file is kept as the module's docstring entry-point so existing imports
(``from mantleproof.x402.middleware import require_payment``) fail loudly
instead of silently degrading to a no-op.
"""

from __future__ import annotations


async def require_payment(*args, **kwargs):  # noqa: ANN002, ANN003
    raise NotImplementedError(
        "x402 paywall now lives at POST /x402/audit/{address} — see "
        "mantleproof.api.routes_x402. Direct middleware import is intentionally "
        "unused; route the request through FastAPI."
    )
