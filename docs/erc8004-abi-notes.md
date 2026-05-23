# ERC-8004 v2 — verified ABI notes (T37 Phase 0)

> Hard-gate output for the Tier 2 reputation work
> (`docs/tier2-erc8004-reputation-scope.md`). Findings verified **2026-05-23**
> against both the canonical source (`github.com/erc-8004/erc-8004-contracts`,
> branch `master`) and the **deployed bytecode on Mantle mainnet (chainId 5000)**
> via direct RPC `eth_call`. Not a locked spec — supersedes the secondary-research
> assumptions in `tier2-erc8004-reputation-scope.md` where they conflict.

## tl;dr — the scope doc's central assumption is wrong against v2

The scope doc assumes `giveFeedback` requires a signed `FeedbackAuth` blob, and
plans an off-chain signing seam (`engine/mantleproof/reputation/feedback_auth.py`)
with MantleProof's owner key signing each authorization. **That is not what the
deployed contract does.**

Deployed v2 `giveFeedback` has **no `feedbackAuth` parameter and no signature
verification at all.** The only authorization gate is:

```solidity
require(
    !IIdentityRegistry(_identityRegistry).isAuthorizedOrOwner(msg.sender, agentId),
    "Self-feedback not allowed"
);
```

i.e. *anyone who is NOT the iNFT owner/operator/approved address can call
`giveFeedback(96, …)` directly.* The model is fully permissionless from the
funder's side — no MantleProof-side signature, no key custody risk, no
asynchronous auth-issuance step.

This **simplifies** the plan substantially. See `## Plan-correction summary` at
the bottom.

---

## Live verification log (2026-05-23, Mantle mainnet chainId 5000)

Direct `eth_call` against `MANTLE_RPC_URL`; output captured verbatim:

```
chainId = 5000
reputation.getVersion()         = '2.0.0'
identity.getVersion()           = '2.0.0'
reputation.getIdentityRegistry()= 0x8004a169fb4a3325136eb29fa0ceb6d2e539a432
  match identity addr           = True
identity.ownerOf(96)            = 0x2a3080aa52de07702dd30b81cc97c3527e605b6a
getSummary(96, [], '', '')      → revert "clientAddresses required"
getSummary(96, [0x...01],'','') → count=0, value=0, decimals=0  (no feedback yet)
```

- Reputation Registry `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` is v2.0.0,
  storage location `erc8004.reputation.registry.2`.
- Identity Registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` is v2.0.0.
- Reputation's stored `_identityRegistry` slot matches the canonical Identity
  Registry — bidirectional wiring confirmed.
- MantleProof's tokenId 96 is owned by `0x2a3080AA…605B6A` (matches
  `MANTLEPROOF_AGENT_TOKEN_ID=96` from T5).
- `getSummary` with an empty client array **reverts** ("clientAddresses
  required") — Phase 4's suggested `getSummary(96, [], "", "")` will not work;
  enumerate via `getClients(96)` first.

## Reputation Registry — verbatim ABI (v2)

### Writes

```solidity
function giveFeedback(
    uint256 agentId,
    int128  value,
    uint8   valueDecimals,
    string  calldata tag1,
    string  calldata tag2,
    string  calldata endpoint,
    string  calldata feedbackURI,
    bytes32 feedbackHash
) external;
```
selector: `0x` + first 4 bytes of `keccak("giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)")`

Authorization (only check):
```solidity
require(
    !IIdentityRegistry(_identityRegistry).isAuthorizedOrOwner(msg.sender, agentId),
    "Self-feedback not allowed"
);
```
Additional value bounds: `valueDecimals <= 18`, `|value| <= 1e38`.

```solidity
function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external;
function appendResponse(
    uint256 agentId,
    address clientAddress,
    uint64  feedbackIndex,
    string  calldata responseURI,
    bytes32 responseHash
) external;
```

### Reads

```solidity
function getIdentityRegistry() external view returns (address);
function getVersion()          external pure returns (string memory);

function getLastIndex(uint256 agentId, address clientAddress)
    external view returns (uint64);

function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)
    external view
    returns (int128 value, uint8 valueDecimals,
             string memory tag1, string memory tag2, bool isRevoked);

function getSummary(
    uint256 agentId,
    address[] calldata clientAddresses,   // MUST be non-empty (reverts otherwise)
    string  calldata tag1,
    string  calldata tag2
) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals);

function readAllFeedback(
    uint256 agentId,
    address[] calldata clientAddresses,   // empty => use all stored clients (NO revert here)
    string  calldata tag1,
    string  calldata tag2,
    bool    includeRevoked
) external view returns (
    address[] memory clients,
    uint64[]  memory feedbackIndexes,
    int128[]  memory values,
    uint8[]   memory valueDecimals,
    string[]  memory tag1s,
    string[]  memory tag2s,
    bool[]    memory revokedStatuses
);

function getResponseCount(
    uint256 agentId,
    address clientAddress,                // address(0) => count across all clients
    uint64  feedbackIndex,                // 0 (with non-zero clientAddress) => all indices
    address[] calldata responders         // empty => count all responders
) external view returns (uint64 count);

function getClients(uint256 agentId) external view returns (address[] memory);
```

Note the asymmetry: **`getSummary` requires `clientAddresses` non-empty and
reverts otherwise; `readAllFeedback` accepts empty and falls back to
`$._clients[agentId]`**. This is the right surface for our use case — we use
`getClients(96)` (or maintain our own list) → `getSummary(96, clients, "", "")`
to get a single aggregate score honestly.

### Events

```solidity
event NewFeedback(
    uint256 indexed agentId,
    address indexed clientAddress,
    uint64           feedbackIndex,
    int128           value,
    uint8            valueDecimals,
    string  indexed  indexedTag1,
    string           tag1,
    string           tag2,
    string           endpoint,
    string           feedbackURI,
    bytes32          feedbackHash
);
event FeedbackRevoked(
    uint256 indexed agentId,
    address indexed clientAddress,
    uint64  indexed feedbackIndex
);
event ResponseAppended(
    uint256 indexed agentId,
    address indexed clientAddress,
    uint64           feedbackIndex,
    address indexed  responder,
    string           responseURI,
    bytes32          responseHash
);
```

## Identity Registry — verbatim ABI (v2)

Storage: `erc8004.identity.registry`. Inherits `ERC721URIStorageUpgradeable`
(so `ownerOf`, `balanceOf`, `tokenURI`, `safeTransferFrom`, etc. are all
present from OZ ERC-721). Registry-specific additions:

```solidity
function register() external returns (uint256 agentId);
function register(string memory agentURI)
    external returns (uint256 agentId);
function register(string memory agentURI, MetadataEntry[] memory metadata)
    external returns (uint256 agentId);

function getMetadata(uint256 agentId, string memory metadataKey)
    external view returns (bytes memory);
function setMetadata(uint256 agentId, string memory metadataKey, bytes memory metadataValue)
    external;

function setAgentURI(uint256 agentId, string calldata newURI) external;

function getAgentWallet(uint256 agentId) external view returns (address);
function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes calldata signature)
    external;
function unsetAgentWallet(uint256 agentId) external;

function isAuthorizedOrOwner(address spender, uint256 agentId)
    external view returns (bool);
```

`isAuthorizedOrOwner` returns true for: the iNFT owner, anyone the owner has
`setApprovalForAll`'d, or the per-token approved address. Reverts with
`ERC721NonexistentToken(agentId)` if the agent doesn't exist.

The repo's current `IEIP8004.sol` `IIdentityRegistry` only declares `agentURI`
(non-existent — `tokenURI` is the ERC-721 standard) and `ownerOf` (real, via
ERC-721). T38 rewrites it.

## Implications for the plan

| Scope-doc assumption | Live reality | Plan delta |
|---|---|---|
| `giveFeedback` requires signed `FeedbackAuth` | **No `feedbackAuth` parameter exists; only "not self" check.** | T39 drops the off-chain signing seam. No engine signing key. No owner-key custody risk. |
| MantleProof signs auth blobs off-chain | Not required. | T39 becomes a **pure call-data builder** (no signature, no key). |
| Funder gets auth then submits via giveFeedback | Funder submits giveFeedback directly. | Demo agent calls `giveFeedback(96, …)` from its own wallet. |
| `getSummary(96, [], "", "")` for "all feedback" | **Reverts** on empty `clientAddresses`. | Phase 4 enumerates via `getClients(96)` first, then summarises. |
| `IReputationRegistry.reputationOf(tokenId)` | **Does not exist.** Function in current `IEIP8004.sol` is fictional. | T38 rewrites the interface; `MantleProofAgent.reputation()` is permanently broken on-chain (already deployed immutable) → mark defunct, frontend reads `getSummary` directly. |
| `IReputationRegistry.postFeedback(...)` | **Does not exist.** Function in current `IEIP8004.sol` is fictional. | T38 rewrites — replaced by `giveFeedback` with the real signature. |
| `IIdentityRegistry.agentURI(tokenId)` | **Does not exist.** Standard is ERC-721 `tokenURI(tokenId)`. | T38 fixes — `MantleProofAgent.agentURI()` is similarly bricked on-chain. |

The sybil gate (originally "signed auth issued only to addresses that paid")
moves to the demo-script layer: only EOAs that paid `payForAudit(target)` and
have a `MantleProofLicense.AuditPaid(payer,target,…)` event should be the ones
the demo helps call `giveFeedback`. The chain itself does not enforce this —
we enforce it operationally because we want the on-chain reputation signal to
mean "real customer feedback," not random spam.

## Signing-key question — resolved

Original open item from the scope doc: *"If only the identity-NFT owner can
sign, signing must stay in the offline demo script; do not load the owner key
into the engine."*

**Resolved: there is no signing required at all.** The owner key never needs to
be near anything reputation-related. The demo agent's existing wallet (the same
EOA that paid for the audit in T26/T27/T28) just calls `giveFeedback` directly
— that's its own private key signing its own tx, never MantleProof's.

The one constraint: the demo agent EOA **must not** be MantleProof's iNFT
owner or operator (otherwise `isAuthorizedOrOwner` returns true and the
"Self-feedback not allowed" guard triggers). Demo agents are independent EOAs
(`0x4354…fc1f3`, `0xB74a…A148`, `0x9979…66c3`), MantleProof's owner is
`0x2a30…605B6A`, and `setApprovalForAll` has never been called → pre-flight
assertion is cheap.

## Plan-correction summary (carries into T38–T41)

- **T38 (interfaces)**: rewrite `IEIP8004.sol` `IReputationRegistry` to the
  real v2 ABI above; rewrite `IIdentityRegistry` so it uses ERC-721 `tokenURI`
  (not the fictional `agentURI`); update `MockReputationRegistry` to mirror
  `giveFeedback` + `getSummary` + `getClients`; mark
  `MantleProofAgent.{reputation, agentURI}()` defunct in source (doc comment,
  no redeploy).
- **T39 (engine)**: shrinks to a **pure call-data builder**
  `build_give_feedback_calldata(agentId, value, valueDecimals, tag1, tag2,
  endpoint, feedbackURI, feedbackHash)` returning the hex blob; **no signing
  seam, no key handling**. The "sybil gate" check (`AuditPaid` log exists for
  payer) stays — that's a logical guardrail, not an on-chain one. Settings
  changes shrink to `mantleproof_agent_token_id` only (no feedback-signer key).
- **T40 (demo)**: `give_feedback_demo.py` takes a payer wallet (env or
  CLI-supplied private key for the demo wallet), builds calldata via T39, and
  submits the tx from that wallet to the Reputation Registry. The verifier
  reads `getSummary(96, [payer], "", "")` (and optionally
  `readAllFeedback(96, [payer], "", "", false)`) for independent confirmation.
- **T41 (frontend)**: read `getClients(96)` → pass to
  `getSummary(96, clients, "", "")`. Show count + summary value honestly; if
  `getClients(96)` is empty render "no feedback yet" (per design rules — no
  fabricated numbers).
- **CLAUDE.md correction (T42)**: still needed, but the new line is honest:
  *"agents that paid for an audit may call the official Reputation Registry
  directly to leave feedback about MantleProof"* — not "MantleProofAgent calls
  the Reputation Registry on each audit."

---

## Selector reference

```
giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)
getSummary(uint256,address[],string,string)
readAllFeedback(uint256,address[],string,string,bool)
getLastIndex(uint256,address)
readFeedback(uint256,address,uint64)
getClients(uint256)
revokeFeedback(uint256,uint64)
appendResponse(uint256,address,uint64,string,bytes32)
getResponseCount(uint256,address,uint64,address[])
isAuthorizedOrOwner(address,uint256)
```

(Selectors are 4-byte keccak prefixes; trivially derivable, intentionally not
hard-coded here to avoid copy-paste rot — `eth_utils.keccak(text=sig)[:4]` or
`cast sig` is the source of truth.)

## Sources

- Canonical source: `github.com/erc-8004/erc-8004-contracts` @ `master`
  (`contracts/ReputationRegistryUpgradeable.sol` 385 LOC,
  `contracts/IdentityRegistryUpgradeable.sol` 213 LOC).
- Deployed bytecode: Mantle mainnet 5000 — Reputation
  `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`, Identity
  `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` — both report
  `getVersion() == "2.0.0"`, both wired together (`reputation.getIdentityRegistry()
  == identity`).
- Sepolia 5003 addresses per CLAUDE.md (Reputation
  `0x8004B663…8713`, Identity `0x8004A818…BD9e`); not re-verified on this pass
  since MantleProof's Sepolia agentTokenId is 0 — Sepolia rehearsal will at
  most exercise call-data builder + the self-register flow first.
