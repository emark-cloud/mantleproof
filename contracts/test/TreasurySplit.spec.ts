import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("TreasurySplit", () => {
  async function deploy() {
    const [owner, stranger, dest] = await ethers.getSigners();
    const t = await (await ethers.getContractFactory("TreasurySplit")).deploy(
      owner.address,
    );
    await owner.sendTransaction({
      to: await t.getAddress(),
      value: ethers.parseEther("5"),
    });
    return { t, owner, stranger, dest };
  }

  it("accepts funds via receive()", async () => {
    const { t } = await deploy();
    expect(await ethers.provider.getBalance(await t.getAddress())).to.equal(
      ethers.parseEther("5"),
    );
  });

  it("withdrawal is timelocked: propose -> wait -> execute", async () => {
    const { t, owner, dest } = await deploy();
    const amount = ethers.parseEther("2");

    await expect(t.connect(owner).executeWithdrawal()).to.be.revertedWithCustomError(
      t,
      "NoPending",
    );

    await t.connect(owner).proposeWithdrawal(dest.address, amount);
    await expect(
      t.connect(owner).executeWithdrawal(),
    ).to.be.revertedWithCustomError(t, "Timelocked");

    await time.increase(2 * 24 * 60 * 60 + 1);
    const before = await ethers.provider.getBalance(dest.address);
    await expect(t.connect(owner).executeWithdrawal())
      .to.emit(t, "WithdrawalExecuted")
      .withArgs(dest.address, amount);
    expect(await ethers.provider.getBalance(dest.address)).to.equal(before + amount);
  });

  it("only owner can propose / cancel", async () => {
    const { t, owner, stranger, dest } = await deploy();
    await expect(
      t.connect(stranger).proposeWithdrawal(dest.address, 1),
    ).to.be.revertedWithCustomError(t, "OwnableUnauthorizedAccount");
    await t.connect(owner).proposeWithdrawal(dest.address, 1);
    await t.connect(owner).cancelWithdrawal();
    await expect(t.connect(owner).executeWithdrawal()).to.be.revertedWithCustomError(
      t,
      "NoPending",
    );
  });
});
