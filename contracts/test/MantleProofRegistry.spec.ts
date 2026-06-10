import { expect } from "chai";
import { ethers } from "hardhat";

const TIER1 = 1;
const TIER2 = 2;
const HIGH = 3; // Severity.High
const ROOT = ethers.keccak256(ethers.toUtf8Bytes("root-1"));

// Staking deactivated (roadmap): submitAudit is nonpayable for both tiers and
// the registry constructor no longer takes a StakingPool — audits anchor for
// gas only.
async function deployRegistry(
  oracle: { address: string },
  owner: { address: string },
) {
  const deployerSigner = await ethers.getSigner(owner.address);
  const Reg = await ethers.getContractFactory("MantleProofRegistry");
  const reg = await Reg.connect(deployerSigner).deploy(oracle.address, owner.address);
  return { reg };
}

describe("MantleProofRegistry", () => {
  async function deploy() {
    const [owner, oracle, other, target] = await ethers.getSigners();
    const { reg } = await deployRegistry(oracle, owner);
    return { reg, owner, oracle, other, target };
  }

  it("only the oracle signer can submitAudit", async () => {
    const { reg, oracle, other, target } = await deploy();
    await expect(
      reg.connect(other).submitAudit(target.address, TIER1, HIGH, ROOT, "cid"),
    ).to.be.revertedWithCustomError(reg, "NotOracleSigner");

    await expect(reg.connect(oracle).submitAudit(target.address, TIER1, HIGH, ROOT, "cid"))
      .to.emit(reg, "AuditSubmitted")
      .withArgs(target.address, ROOT, HIGH, "cid", TIER1);
  });

  it("getAudit returns the latest report; unknown target reverts", async () => {
    const { reg, oracle, target } = await deploy();
    await expect(reg.getAudit(target.address)).to.be.revertedWithCustomError(
      reg,
      "UnknownTarget",
    );
    await reg.connect(oracle).submitAudit(target.address, TIER1, HIGH, ROOT, "cid");
    const r = await reg.getAudit(target.address);
    expect(r.rootHash).to.equal(ROOT);
    expect(r.severity).to.equal(HIGH);
    expect(r.ipfsCID).to.equal("cid");
    expect(r.submitter).to.equal(oracle.address);
    expect(r.tier).to.equal(TIER1);
    expect(await reg.isAudited(target.address)).to.equal(true);
    expect(await reg.auditCount(target.address)).to.equal(1n);
    expect(await reg.auditTier(ROOT)).to.equal(TIER1);
    expect(await reg.auditTarget(ROOT)).to.equal(target.address);
  });

  it("setAgent is admin-only and submitAudit advances the linked agent", async () => {
    const { reg, owner, oracle, other, target } = await deploy();

    const Id = await ethers.getContractFactory("MockIdentityRegistry");
    const id = await Id.deploy();
    const Rep = await ethers.getContractFactory("MockReputationRegistry");
    const rep = await Rep.deploy();
    const Agent = await ethers.getContractFactory("MantleProofAgent");
    const agent = await Agent.deploy(
      await id.getAddress(),
      await rep.getAddress(),
      1,
      owner.address,
    );
    await agent.connect(owner).setAuditor(await reg.getAddress());

    await expect(
      reg.connect(other).setAgent(await agent.getAddress()),
    ).to.be.revertedWithCustomError(reg, "OwnableUnauthorizedAccount");

    await reg.connect(owner).setAgent(await agent.getAddress());
    await reg.connect(oracle).submitAudit(target.address, TIER1, HIGH, ROOT, "cid");

    expect(await agent.auditsPerformed()).to.equal(1n);
    expect(await agent.memoryRoot()).to.equal(
      ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [ethers.ZeroHash, ROOT]),
    );
  });

  it("Tier 2 submitAudit anchors for gas only (staking deactivated)", async () => {
    const { reg, oracle, target } = await deploy();
    await expect(
      reg.connect(oracle).submitAudit(target.address, TIER2, HIGH, ROOT, "cid"),
    )
      .to.emit(reg, "AuditSubmitted")
      .withArgs(target.address, ROOT, HIGH, "cid", TIER2);
    const r = await reg.getAudit(target.address);
    expect(r.tier).to.equal(TIER2);
  });

  it("invalid tier reverts", async () => {
    const { reg, oracle, target } = await deploy();
    await expect(
      reg.connect(oracle).submitAudit(target.address, 3, HIGH, ROOT, "cid"),
    ).to.be.revertedWithCustomError(reg, "InvalidTier");
  });
});
