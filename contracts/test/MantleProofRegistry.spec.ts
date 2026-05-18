import { expect } from "chai";
import { ethers } from "hardhat";

const HIGH = 3; // Severity.High
const ROOT = ethers.keccak256(ethers.toUtf8Bytes("root-1"));

describe("MantleProofRegistry", () => {
  async function deploy() {
    const [owner, oracle, other, target] = await ethers.getSigners();
    const Reg = await ethers.getContractFactory("MantleProofRegistry");
    const reg = await Reg.deploy(oracle.address, owner.address);
    return { reg, owner, oracle, other, target };
  }

  it("only the oracle signer can submitAudit", async () => {
    const { reg, oracle, other, target } = await deploy();
    await expect(
      reg.connect(other).submitAudit(target.address, HIGH, ROOT, "cid"),
    ).to.be.revertedWithCustomError(reg, "NotOracleSigner");

    await expect(reg.connect(oracle).submitAudit(target.address, HIGH, ROOT, "cid"))
      .to.emit(reg, "AuditSubmitted")
      .withArgs(target.address, ROOT, HIGH, "cid");
  });

  it("getAudit returns the latest report; unknown target reverts", async () => {
    const { reg, oracle, target } = await deploy();
    await expect(reg.getAudit(target.address)).to.be.revertedWithCustomError(
      reg,
      "UnknownTarget",
    );
    await reg.connect(oracle).submitAudit(target.address, HIGH, ROOT, "cid");
    const r = await reg.getAudit(target.address);
    expect(r.rootHash).to.equal(ROOT);
    expect(r.severity).to.equal(HIGH);
    expect(r.ipfsCID).to.equal("cid");
    expect(r.submitter).to.equal(oracle.address);
    expect(await reg.isAudited(target.address)).to.equal(true);
    expect(await reg.auditCount(target.address)).to.equal(1n);
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
    await reg.connect(oracle).submitAudit(target.address, HIGH, ROOT, "cid");

    expect(await agent.auditsPerformed()).to.equal(1n);
    expect(await agent.memoryRoot()).to.equal(
      ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [ethers.ZeroHash, ROOT]),
    );
  });
});
