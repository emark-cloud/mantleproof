"""Disputes layer (docs/update.md §2, T43+T44).

When a dispute lands on-chain (``MantleProofRegistry.DisputeSubmitted``), the
engine:
  1. fetches the disputer's counter-claim from IPFS (``fetch.py``),
  2. constructs a Tier 2 re-audit prompt that loads the ORIGINAL audit + the
     COUNTER-CLAIM into the user block (``reaudit.py`` + the extended
     ``tier2/prompt.py``),
  3. runs the SAME hallucination guard / honesty labels on the re-audit text
     (no relaxation per CLAUDE.md invariant),
  4. posts the verdict via ``MantleProofRegistry.resolveDispute(...)`` with
     the oracle key (``resolver.py`` reuses ``persistence/anchor.py``).

Pure helpers are unit-tested offline; live RPC seams are dependency-injected
the same way ``persistence/registry_reader.py`` does it.
"""
