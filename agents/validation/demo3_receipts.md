# Demo 3 -- yield-agent receipts (T28)

Single row per end-to-end run. Spec receipts (docs/mantleproof.md §7):
  1. `getAudit(LBRouter)` -- free on-chain read.
  2. **LB `addLiquidityNATIVE` tx** -- real Merchant Moe LB v2.2 deposit
     (single-sided WMNT to one bin above active id on WMNT/USDT0 bs=25).
  3. **DecisionLog `APPROVED`** -- proof the deposit decision was made on
     MantleProof data, referencing the audit rootHash.

Mainnet-only: Merchant Moe LB not deployed on Sepolia. payForAudit /
submitAudit are the BOOTSTRAP receipts (audit creation); blank if reused.

| timestamp | network | audit target (LBRouter) | payForAudit (boot) | submitAudit (boot) | rootHash | severity | **addLiquidity tx** | **DecisionLog tx** |
|---|---|---|---|---|---|---|---|---|
| 2026-05-20T09:15:02.702Z | mantle | `0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a` | `0xda3f5e9b96e00968f7d37e764ec56c58727352d6d519417f4f2a4896cf233555` | `0xd529d8cf3b27bb61cc31ac2e21970d33f878a4338ccc726764423bb319365271` | `0xd984d08cb796ec3967b9a0a1102fda1b775427f867357989597c131835778dc1` | INFO | **`0xbb1bb066650e07c5c71839f7218809cb728c3f8a33cfc12730f47adc64f578f9`** | **`0x2375ad00d8a4f61c9baad9d50a6f7398add28e7898135ef350766e3b91f5e9c0`** |
| 2026-05-24T12:50:43.460Z | mantle | `0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a` | `0x34879dd428b21bf632cca78965ce590c758ec5ae07b01c641a4fdd1df5b35842` | `0xdce37de275d561d8aa9bf3836fb7eec4d120d4a968f5a2315232435a1dca2349` | `0x37ff62a05f9e66151b36846e28a77494ccc9733a298200d3aa62b1a607d3b373` | MEDIUM | **`0x52904eb2c3b9882c35610dc187c75cbf54ae8eff7a4223e691bd8a1ff37f439e`** | **`0x82760ff271172d2ce6209a25e880072ffc67781a181ff536c933f6c5416e1725`** |
