# Scope: Tier 2 — Real ERC-8004 Reputation Integration

> Scope/design doc (not one of the three locked specs). Companion to
> `docs/plan-high-leverage-improvements.md`. Status: approved 2026-05-22.

## Context

MantleProof's x402 paywall charges an agent 0.50 USDC to *create* an audit; the
audit is then a free public good forever (an intentional commons — `TODO.md`
decisions log, 2026-05-22). The "Tier 2" idea was to give the paying agent an
on-chain ERC-8004 reputation credit so it feels like a patron, not a free-rider.

Phase-1 research found that idea is **structurally impossible**: the real
ERC-8004 Reputation Registry has no "credit an arbitrary agent" function, and its
feedback model is strictly **client → server-agent** with the reviewed agent
pre-authorizing its reviewer. You cannot mint reputation *for* a funder.

The chosen direction is the realistic, spec-correct one: **flip it — paying
agents leave genuine on-chain ERC-8004 feedback *about MantleProof*.** MantleProof
(ERC-8004 agent tokenId 96) accrues real auditor reputation from the agents it
has served. This is exactly the interaction ERC-8004 was designed for, and it
delivers what `CLAUDE.md` already (incorrectly) claims happens: "calls Mantle's
official Reputation Registry on each audit."

## Key facts established in research

- **The repo's `IEIP8004.sol` is fictional.** `IReputationRegistry.postFeedback`
  / `reputationOf` do not exist on the deployed registry. The real ABI:
  `giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1,
  string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)` plus a
  signed **`feedbackAuth`**; reads via `getSummary(agentId, clientAddresses[],
  tag1, tag2)` and `readAllFeedback(...)`. (Exact ABI is Phase-0 — see below.)
- **`feedbackAuth`** is a signed authorization (fields ≈ `agentId`,
  `clientAddress`, `indexLimit`, `expiry`, `chainId`, `identityRegistry`,
  `signerAddress`) signed by the **reviewed agent's** authoritative key, verified
  EIP-191 / ERC-1271. The client is identified by **address, not tokenId** — so
  **funders need no ERC-8004 identity of their own.**
- **Latent bug:** `MantleProofAgent.reputation()` (`MantleProofAgent.sol:73-75`)
  calls the nonexistent `reputationOf` — it reverts against the live registry.
  The frontend `/agent/96` reads it. Must be fixed.
- **No MantleProof contract redeploy is required.** Funders call the *official*
  Reputation Registry directly; MantleProof's only on-chain-adjacent job is to
  sign `feedbackAuth` blobs off-chain. MantleProof's own deployed contracts are
  untouched.
- Official Reputation Registry: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`
  (Mantle 5000) / `0x8004B663056A597Dffe9eCcC1965A193B7388713` (5003, where
  MantleProof's `agentTokenId` is still 0 — T5 never done on testnet).
- Demo agents (`agents/src/{deployer,trading,yield}-agent.ts`) are plain EOAs
  that pay via `MantleProofLicense.payForAudit` — they can call `giveFeedback`
  directly (address-only client). The `payForAudit` (Mantle-native) path is the
  clean demo path; x402's payer is a Base address (cross-chain caveat).

## Approach

When MantleProof completes a paid audit, it issues the paying agent a signed
`feedbackAuth` authorizing that agent to rate MantleProof. The agent may then
call `giveFeedback(96, …, feedbackAuth)` on the official registry. MantleProof's
reputation becomes real, on-chain, and composable.

Scope the **`payForAudit` (Mantle) path** as the implemented + demoed flow.
x402 auto-issuance is a noted follow-on (it needs the engine to hold a signing
key — see Risks).

### Phase 0 — Verify the real ABI (gates everything)

Pull the **actual** ABI of the official Reputation Registry and Identity Registry
from the verified source on Etherscan V2 (chainId-routed, key already in `.env`)
or `github.com/erc-8004/erc-8004-contracts`. Confirm verbatim: `giveFeedback`
signature, the `FeedbackAuth` struct + its EIP-191/712 encoding, **which key may
sign `feedbackAuth` for agent 96** (identity-NFT owner vs a delegatable
operator/signer), and `getSummary` / `readAllFeedback` signatures. If any
assumption here breaks, revisit the plan before coding.

### Phase 1 — Fix the fictional interface (latent-bug correctness)

- Rewrite `contracts/contracts/interfaces/IEIP8004.sol` `IReputationRegistry`
  (and re-verify `IIdentityRegistry`) to the Phase-0 ABI.
- Update `contracts/contracts/test/MockReputationRegistry.sol` to mirror the real
  ABI so contract tests stay meaningful.
- `MantleProofAgent.reputation()` is deployed and cannot be patched in-place.
  Mark it defunct in source (doc comment / revert-with-reason for any future
  deploy) and **stop relying on it** — the frontend will read the official
  registry directly instead. Do **not** redeploy `MantleProofAgent`.

### Phase 2 — feedbackAuth issuance (engine)

- New module `engine/mantleproof/reputation/feedback_auth.py`: a **pure**
  `FeedbackAuth` payload builder (agentId 96, clientAddress = payer, indexLimit,
  expiry, chainId, registry addr) + an **injectable signing seam** — mirror the
  pure-core + injectable-seam pattern of `engine/mantleproof/x402/` and
  `pipeline.py`. Signing key is supplied by the caller, never hardcoded.
- `engine/mantleproof/settings.py`: add `mantleproof_agent_token_id` and a
  feedback-signer key/option (key only loaded by the demo script, not the API —
  see Risks).
- Issue an auth **only to an address that actually paid** — verify an
  `AuditPaid(payer,target,…)` log exists (`MantleProofLicense.sol:32`). This is
  the ERC-8004-intended sybil gate; do not hand auths to non-customers.
- Unit-test the pure builder offline (pattern: `engine/tests/test_x402_*.py`).

### Phase 3 — Demo flow + verifier

- New script `engine/scripts/give_feedback_demo.py` (or `agents/scripts/`):
  given a payer + audit, build & sign the `feedbackAuth`, then have the agent
  wallet call `giveFeedback(96, …)` on the official registry.
- Add a feedback step to one demo agent (`agents/src/deployer-agent.ts`): after
  pay → audit, call `giveFeedback`.
- New `engine/scripts/verify_reputation_receipt.py` mirroring the
  `verify_demoN_receipt.py` discipline — read `getSummary(96, …)` back from chain
  and confirm the feedback landed. Testnet-first (CLAUDE.md): rehearse on
  Sepolia, then mainnet — **note** Sepolia `agentTokenId` is 0, so a Sepolia
  rehearsal needs an identity first or rehearses only the signing logic.

### Phase 4 — Frontend

- `frontend/src/lib/contracts.ts`: add the official Reputation Registry address +
  minimal real ABI (`getSummary`).
- `frontend/src/pages/Agent.tsx` (`/agent/96`): stop reading the broken
  `MantleProofAgent.reputation()`; read `getSummary(96, [], "", "")` from the
  official registry. Show feedback count + aggregated score, honestly ("no
  feedback yet" when count is 0 — no fabricated numbers, per design rules).
- Optional: one line on the landing page / Tier-2 flow noting MantleProof itself
  carries on-chain ERC-8004 reputation earned from the agents it has served.

## Critical files

| Concern | Path |
|---|---|
| ABI interface (rewrite) | `contracts/contracts/interfaces/IEIP8004.sol` |
| Test mock (sync to real ABI) | `contracts/contracts/test/MockReputationRegistry.sol` |
| Defunct view (mark) | `contracts/contracts/MantleProofAgent.sol` |
| New: auth builder | `engine/mantleproof/reputation/feedback_auth.py` |
| Settings | `engine/mantleproof/settings.py` |
| New: demo + verifier scripts | `engine/scripts/give_feedback_demo.py`, `engine/scripts/verify_reputation_receipt.py` |
| Demo agent step | `agents/src/deployer-agent.ts` |
| Frontend contracts/ABI | `frontend/src/lib/contracts.ts` |
| Frontend agent page | `frontend/src/pages/Agent.tsx` |

## Verification

- Engine: `cd engine && pytest && ruff check . && mypy .` — new `feedback_auth`
  unit tests pass; suite stays green.
- Contracts: `pnpm --filter @mantleproof/contracts exec hardhat compile` +
  `hardhat test` — `MockReputationRegistry` + `MantleProofAgent` specs updated
  and green.
- End-to-end: run `give_feedback_demo.py` on Sepolia (rehearsal), then mainnet;
  confirm with `verify_reputation_receipt.py` that `getSummary(96)` reflects the
  new feedback entry (real on-chain receipt, independently re-read — not trusting
  the script's own print).
- Frontend: `pnpm --filter @mantleproof/frontend typecheck`; load `/agent/96` and
  confirm it shows the live `getSummary(96)` result.

## Risks & open items

- **Phase 0 is a hard gate.** Exact ABI / `FeedbackAuth` encoding is from
  secondary research, not yet the deployed bytecode. Verify before coding.
- **feedbackAuth signer key.** If ERC-8004 only accepts the identity-NFT *owner*
  (`0x2a3080AA…605B6A`) as signer, signing must stay in the offline demo script —
  do **not** load the owner key into the engine API (CLAUDE.md key hygiene). If a
  delegatable operator/signer is supported, register one for agent 96 so x402
  auto-issuance becomes possible later. This decides x402 parity.
- **x402 path deferred.** Auto-issuing a signed auth in the x402 response needs
  the engine to hold a signing key; out of core scope. x402 can still return the
  *unsigned* auth intent + instructions.
- **Negative feedback is possible and correct.** A real paying customer can rate
  MantleProof poorly. That is honest reputation — do not suppress it.
- **Effort.** This is multi-day and the submission window is tight (`TODO.md`
  Week 7 = video/README/submit). A minimum demoable slice = Phases 0–3 (skip
  Phase 4 polish). Tier 2 was already logged as a post-hackathon enhancement;
  treat full delivery accordingly.
- After implementation, correct the `CLAUDE.md` line that claims MantleProofAgent
  "calls Mantle's official Reputation Registry on each audit" — it does not; the
  new flow is funders calling it about MantleProof.
