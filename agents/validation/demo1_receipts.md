# Demo 1 -- deployer-agent receipts (T26)

Single row per end-to-end run. Network-agnostic: Sepolia rehearsals
and mainnet receipts share the same ledger so the audit trail is one
doc.

| timestamp | network | vault | payForAudit tx | submitAudit tx | rootHash | severity |
|---|---|---|---|---|---|---|
| 2026-05-20T07:42:34.715Z | mantleSepolia | `0x1892f77e335c133ce4a7b28555f13ba74cbb76fa` | `0x4aab64d3a3206d84f1b953de8a97630096e862d3b98ec0229218a08853761352` | `0xe68ee49b50d54076d96eefdfb0222b6ab1227a08a38455cbebb54f8414398942` | `0x807b6334bdc29fdc52f32da347b544e08024fc9845d232fc26c06acc72607a2d` | HIGH |
| 2026-05-20T07:48:18.966Z | mantle | `0x1892f77e335c133ce4a7b28555f13ba74cbb76fa` | `0xde00a2f30eb6f10d294c109b1384ce893bc01555356dac19b986ab41c905f00a` | `0x7cfbb72bfff2bacc50603c48bbe9727730aace7d4a6d23fcb3408d1b147be4ca` | `0x6a69e7d466ad95bb35d932b2e40f9d6f5be16985ea1f093f16e598c05c09ca46` | HIGH |
| 2026-05-24T12:31:16.503Z | mantle | `0x1892f77e335c133ce4a7b28555f13ba74cbb76fa` | `0xe04cb2b750443273823c497893ceba50818451c311d04e112c87f77cfc780ce0` | `0x4c6bbed93dc678075d8489e2ce89732d067837f9a28e7a6336f91ca00fcacf08` | `0x3f4799f5863dbb38994c319254e539e53d47e4f63c3e9254b0994db8e04168e9` | HIGH |
