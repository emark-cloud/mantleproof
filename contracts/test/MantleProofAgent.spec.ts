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

  it("stores constructor refs; agentOwner reads through; reputation()/agentURI() are defunct (T38)", async () => {
    const { agent, id, inftOwner } = await deploy();
    expect(await agent.agentTokenId()).to.equal(7n);
    await id.setAgent(7, inftOwner.address, "ipfs://card");
    expect(await agent.agentOwner()).to.equal(inftOwner.address);

    // T38: the deployed wrapper was compiled against the old fictional
    // IReputationRegistry/IIdentityRegistry interface, so its reputation()
    // and agentURI() views call selectors that don't exist on Mantle's
    // canonical v2 registries — they revert on-chain at runtime. Source
    // now matches that reality. Real reputation lives in the official
    // registry's getSummary(agentId, getClients(agentId), "", "") — see
    // docs/erc8004-abi-notes.md.
    await expect(agent.reputation()).to.be.revertedWith(
      /MantleProofAgent\.reputation: defunct on-chain/,
    );
    await expect(agent.agentURI()).to.be.revertedWith(
      /MantleProofAgent\.agentURI: defunct on-chain/,
    );
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
