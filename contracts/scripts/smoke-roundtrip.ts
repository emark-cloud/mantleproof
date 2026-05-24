/**
 * T6 gate: post a fake audit -> read it back via getAudit -> confirm the agent's
 * memoryRoot advanced. Must be green on Mantle Sepolia before the mainnet cutover
 * gate (CLAUDE.md). Run AFTER scripts/deploy.ts.
 */
import { readFileSync } from "node:fs";
import { ethers, network } from "hardhat";

async function main(): Promise<void> {
  const dep = JSON.parse(
    readFileSync(`deployments/${network.name}.addresses.json`, "utf8"),
  );
  const registry = await ethers.getContractAt(
    "MantleProofRegistry",
    dep.contracts.MantleProofRegistry,
  );
  const agent = await ethers.getContractAt(
    "MantleProofAgent",
    dep.contracts.MantleProofAgent,
  );

  // Oracle signer is the only writer.
  const oracle = process.env.ORACLE_SIGNER_PRIVATE_KEY
    ? new ethers.Wallet(process.env.ORACLE_SIGNER_PRIVATE_KEY, ethers.provider)
    : (await ethers.getSigners())[0];

  const target = "0x000000000000000000000000000000000000dEaD";
  const root = ethers.keccak256(ethers.toUtf8Bytes(`smoke-${Date.now()}`));

  const before = await agent.auditsPerformed();
  // Tier 1 smoke (no stake) — exercises the registry/agent wiring without
  // requiring the oracle to hold 2 MNT. Tier 2 e2e is covered by T20 via the
  // engine's pipeline.run_audit.
  const tx = await registry.connect(oracle).submitAudit(target, 1, 3, root, "ipfs://smoke");
  const rcpt = await tx.wait();
  console.log(`[smoke] submitAudit tx=${rcpt?.hash}`);

  const r = await registry.getAudit(target);
  if (r.rootHash !== root) throw new Error("getAudit rootHash mismatch");
  const after = await agent.auditsPerformed();
  if (after !== before + 1n) throw new Error("agent memoryRoot did not advance");

  console.log(
    `[smoke] OK  severity=${r.severity} cid=${r.ipfsCID} ` +
      `auditsPerformed ${before} -> ${after} memoryRoot=${await agent.memoryRoot()}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
