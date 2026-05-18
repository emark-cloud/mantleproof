import { expect } from "chai";
import { ethers } from "hardhat";

const R1 = ethers.keccak256(ethers.toUtf8Bytes("a1"));
const R2 = ethers.keccak256(ethers.toUtf8Bytes("a2"));

describe("MantleProofAgent (Path A wrapper)", () => {
  async function deploy() {
    const [owner, auditor, inftOwner, stranger] = await ethers.getSigners();
    const id = await (await ethers.getContractFactory("MockIdentityRegistry")).deploy();
    const rep = await (await ethers.getContractFactory("MockReputationRegistry")).deploy();
    const agent = await (
      await ethers.getContractFactory("MantleProofAgent")
    ).deploy(await id.getAddress(), await rep.getAddress(), 7, owner.address);
    return { agent, id, rep, owner, auditor, inftOwner, stranger };
  }

  it("stores constructor refs and reads identity/reputation through", async () => {
    const { agent, id, rep, inftOwner } = await deploy();
    expect(await agent.agentTokenId()).to.equal(7n);
    await id.setAgent(7, inftOwner.address, "ipfs://card");
    await rep.postFeedback(7, 42, "good");
    expect(await agent.agentOwner()).to.equal(inftOwner.address);
    expect(await agent.agentURI()).to.equal("ipfs://card");
    expect(await agent.reputation()).to.equal(42n);
  });

  it("setAuditor is owner-only; updateMemoryRoot is auditor-only and compounds", async () => {
    const { agent, owner, auditor, stranger } = await deploy();
    await expect(
      agent.connect(stranger).setAuditor(auditor.address),
    ).to.be.revertedWithCustomError(agent, "OwnableUnauthorizedAccount");
    await agent.connect(owner).setAuditor(auditor.address);

    await expect(
      agent.connect(stranger).updateMemoryRoot(R1),
    ).to.be.revertedWithCustomError(agent, "NotAuditor");

    await agent.connect(auditor).updateMemoryRoot(R1);
    const m1 = ethers.solidityPackedKeccak256(
      ["bytes32", "bytes32"],
      [ethers.ZeroHash, R1],
    );
    expect(await agent.memoryRoot()).to.equal(m1);
    expect(await agent.auditsPerformed()).to.equal(1n);

    await agent.connect(auditor).updateMemoryRoot(R2);
    expect(await agent.memoryRoot()).to.equal(
      ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [m1, R2]),
    );
    expect(await agent.auditsPerformed()).to.equal(2n);
  });
});
