import { expect } from "chai";
import { ethers } from "hardhat";

describe("DecisionLog", () => {
  async function deploy() {
    const [agent, target] = await ethers.getSigners();
    const log = await (await ethers.getContractFactory("DecisionLog")).deploy();
    return { log, agent, target };
  }

  it("logs a decision and bumps count", async () => {
    const { log, agent, target } = await deploy();
    const root = ethers.keccak256(ethers.toUtf8Bytes("audit-root"));
    await expect(log.connect(agent).logDecision(target.address, root, "DECLINED", "pause() backdoor"))
      .to.emit(log, "Decision")
      .withArgs(agent.address, target.address, root, "DECLINED", "pause() backdoor");
    expect(await log.count()).to.equal(1n);
  });

  it("reverts on bad input", async () => {
    const { log, target } = await deploy();
    const root = ethers.ZeroHash;
    await expect(
      log.logDecision(ethers.ZeroAddress, root, "X", ""),
    ).to.be.revertedWith("target=0");
    await expect(
      log.logDecision(target.address, root, "", ""),
    ).to.be.revertedWith("action empty");
  });
});
