/**
 * T25 post-deploy verification — read-only mainnet state checks against
 * deployments/mantle.addresses.json. Matches T20-style receipt discipline:
 * never trust the deploy script's own console.table — read every wired
 * relationship back from chain.
 */
import { readFileSync } from "node:fs";
import { ethers, network } from "hardhat";
import { registriesFor } from "../config/registries";

const REGISTRY_ABI = [
  "function oracleSigner() view returns (address)",
  "function agent() view returns (address)",
  "function owner() view returns (address)",
];
const AGENT_ABI = [
  "function identityRegistry() view returns (address)",
  "function reputationRegistry() view returns (address)",
  "function agentTokenId() view returns (uint256)",
  "function auditor() view returns (address)",
  "function owner() view returns (address)",
  "function agentOwner() view returns (address)",
];
const LICENSE_ABI = [
  "function agent() view returns (address)",
  "function treasury() view returns (address)",
  "function auditPrice() view returns (uint256)",
  "function subscriptionPrice() view returns (uint256)",
  "function owner() view returns (address)",
];
const TREASURY_ABI = ["function owner() view returns (address)"];
const IDENTITY_ABI = ["function ownerOf(uint256) view returns (address)"];

async function main(): Promise<void> {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const reg = registriesFor(chainId);
  const d = JSON.parse(
    readFileSync(`deployments/${network.name}.addresses.json`, "utf8"),
  );

  const registry = new ethers.Contract(d.contracts.MantleProofRegistry, REGISTRY_ABI, ethers.provider);
  const agent = new ethers.Contract(d.contracts.MantleProofAgent, AGENT_ABI, ethers.provider);
  const license = new ethers.Contract(d.contracts.MantleProofLicense, LICENSE_ABI, ethers.provider);
  const treasury = new ethers.Contract(d.contracts.TreasurySplit, TREASURY_ABI, ethers.provider);
  const identity = new ethers.Contract(reg.identityRegistry, IDENTITY_ABI, ethers.provider);

  const [
    regOracle, regAgent, regOwner,
    agIdentity, agRep, agTokenId, agAuditor, agOwner,
    licAgent, licTreasury, licAudit, licSub, licOwner,
    treOwner, identityOwnerOfToken,
  ] = await Promise.all([
    registry.oracleSigner(), registry.agent(), registry.owner(),
    agent.identityRegistry(), agent.reputationRegistry(), agent.agentTokenId(),
    agent.auditor(), agent.owner(),
    license.agent(), license.treasury(), license.auditPrice(), license.subscriptionPrice(), license.owner(),
    treasury.owner(),
    identity.ownerOf(BigInt(d.agentTokenId)),
  ]);

  // agentOwner() pass-through on the agent — proves License's 80/20 recipient resolves.
  const agentOwnerOf = await agent.agentOwner().catch((e: Error) => `ERR:${e.message}`);

  const checks = {
    "registry.oracleSigner == deployment.oracleSigner": regOracle.toLowerCase() === d.oracleSigner.toLowerCase(),
    "registry.agent == MantleProofAgent": regAgent.toLowerCase() === d.contracts.MantleProofAgent.toLowerCase(),
    "agent.auditor == MantleProofRegistry": agAuditor.toLowerCase() === d.contracts.MantleProofRegistry.toLowerCase(),
    "agent.identityRegistry == official 5000 identity": agIdentity.toLowerCase() === reg.identityRegistry.toLowerCase(),
    "agent.reputationRegistry == official 5000 reputation": agRep.toLowerCase() === reg.reputationRegistry.toLowerCase(),
    "agent.agentTokenId == 96": agTokenId === 96n,
    "identity.ownerOf(96) == deployer": identityOwnerOfToken.toLowerCase() === d.owner.toLowerCase(),
    "agent.agentOwner() == deployer (80/20 split recipient resolves)":
      typeof agentOwnerOf === "string" &&
      agentOwnerOf.toLowerCase() === d.owner.toLowerCase(),
    "license.agent == MantleProofAgent": licAgent.toLowerCase() === d.contracts.MantleProofAgent.toLowerCase(),
    "license.treasury == TreasurySplit": licTreasury.toLowerCase() === d.contracts.TreasurySplit.toLowerCase(),
    "license.auditPrice == 0.5 MNT": licAudit === ethers.parseEther("0.5"),
    "license.subscriptionPrice == 5 MNT": licSub === ethers.parseEther("5"),
    "registry.owner == deployer": regOwner.toLowerCase() === d.owner.toLowerCase(),
    "agent.owner == deployer": agOwner.toLowerCase() === d.owner.toLowerCase(),
    "license.owner == deployer": licOwner.toLowerCase() === d.owner.toLowerCase(),
    "treasury.owner == deployer": treOwner.toLowerCase() === d.owner.toLowerCase(),
  };

  const report = {
    chainId,
    deployment: d.contracts,
    agentTokenId: agTokenId.toString(),
    agentOwnerOf,
    oracleSigner: regOracle,
    checks,
  };
  console.log(JSON.stringify(report, null, 2));

  const fails = Object.entries(checks).filter(([, ok]) => !ok);
  if (fails.length) {
    console.error(`POST-DEPLOY FAIL: ${fails.length} checks failed`);
    for (const [k] of fails) console.error("  - " + k);
    process.exitCode = 1;
  } else {
    console.log("POST-DEPLOY OK — all wiring verified on-chain.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
