# Demo 2 -- trading-agent receipts (T27)

Single row per end-to-end run. Headline receipt = the **DecisionLog tx**
(the spec's Demo 2 on-chain proof that the swap was refused on MantleProof
data). The payForAudit / submitAudit columns are the bootstrap (audit-creation)
receipts; blank when the target was already audited.

| timestamp | network | token | payForAudit (bootstrap) | submitAudit (bootstrap) | rootHash | severity | **DecisionLog tx (headline)** |
|---|---|---|---|---|---|---|---|
| 2026-05-20T08:12:18.706Z | mantleSepolia | `0x8f6679eb031799fc9c5e149dfb75b4543808912f` | `0x0bd871141020b08f49e18fbbba9fab491af60b291a6791ae632cdf776aef11be` | `0xdacfa5afd9711f73c492a306584ed6d3a4361970e852bd8901ae0194dc4f966b` | `0x1b401c9fa14e056d64ef1c28659ec195452b3a95dbd5b0473aaad546ce59fe1d` | HIGH | **`0x433a3d78f9e23fddf90bc073bae117f21621e67bcb39c7d93242d3c190a95527`** |
| 2026-05-20T08:20:03.838Z | mantle | `0x8f6679eb031799fc9c5e149dfb75b4543808912f` | `0xa41f70ccebd945014b44880b6c4c92258b6301560b3aef2702c7c61538b8bb58` | `0xc2a54ffa2612f12e566705c06d3adf7938ce26edccc39e7423837de0df7f0e4e` | `0x7443ab83b53e67fb1077446417f547809f5f6184d535080fca363a63e5e23849` | HIGH | **`0x146a38eb3ed9ef5ca00881d253b0a254cb8ff7343d0aa699f8b940165590584f`** |
| 2026-05-24T12:48:17.216Z | mantle | `0x8f6679eb031799fc9c5e149dfb75b4543808912f` | `0x8a558b05f31d7240fb4e93840f828394f2189187524c97b2b0dfc09cb125f70f` | `0xfedd0b7db78f500dc96b638e1e5c55b47f78fe0986a25e355a6f8bb3d6427e6b` | `0x0947f93b6cc6c4e167722a17eddb1684d5113cce0318b5717e8f702595c7087f` | HIGH | **`0x385eaded6f7eba0191ed00972e60077ea4041667c4329a19d400a33efd351119`** |
