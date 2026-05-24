import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const ROOT = ethers.keccak256(ethers.toUtf8Bytes("root-stake"));
const STAKE = ethers.parseEther("2");

describe("StakingPool", () => {
  async function deploy() {
    // For pool unit tests we use a registry-mock signer (`registry`) that calls
    // the pool directly. The real registry's wiring is exercised in
    // MantleProofRegistry.spec.ts.
    const [owner, registry, beneficiary, stranger] = await ethers.getSigners();
    const treasury = owner; // owner-as-treasury for tests
    const pool = await (
      await ethers.getContractFactory("StakingPool")
    ).deploy(registry.address, treasury.address);
    // Fund registry so it can forward msg.value on lockStake.
    await owner.sendTransaction({ to: registry.address, value: ethers.parseEther("50") });
    return { pool, owner, registry, beneficiary, stranger, treasury };
  }

  it("lockStake requires exact msg.value and only the registry can call", async () => {
    const { pool, registry, stranger } = await deploy();
    await expect(
      pool.connect(stranger).lockStake(ROOT, STAKE, { value: STAKE }),
    ).to.be.revertedWithCustomError(pool, "NotRegistry");

    await expect(
      pool.connect(registry).lockStake(ROOT, STAKE, { value: STAKE - 1n }),
    ).to.be.revertedWithCustomError(pool, "WrongValue");

    await expect(pool.connect(registry).lockStake(ROOT, STAKE, { value: STAKE }))
      .to.emit(pool, "StakeLocked");
    expect(await pool.isLocked(ROOT)).to.equal(true);
  });

  it("cannot lock the same rootHash twice", async () => {
    const { pool, registry } = await deploy();
    await pool.connect(registry).lockStake(ROOT, STAKE, { value: STAKE });
    await expect(
      pool.connect(registry).lockStake(ROOT, STAKE, { value: STAKE }),
    ).to.be.revertedWithCustomError(pool, "InvalidParams");
  });

  it("slashByDispute is registry-only and transfers to beneficiary; remainder to treasury", async () => {
    const { pool, registry, beneficiary, treasury, stranger } = await deploy();
    await pool.connect(registry).lockStake(ROOT, STAKE, { value: STAKE });

    await expect(
      pool.connect(stranger).slashByDispute(ROOT, beneficiary.address, STAKE),
    ).to.be.revertedWithCustomError(pool, "NotRegistry");

    const benBefore = await ethers.provider.getBalance(beneficiary.address);
    const treaBefore = await ethers.provider.getBalance(treasury.address);

    // partial slash: half to beneficiary, half to treasury
    const half = STAKE / 2n;
    await expect(
      pool.connect(registry).slashByDispute(ROOT, beneficiary.address, half),
    ).to.emit(pool, "StakeSlashedByDispute");

    expect(await ethers.provider.getBalance(beneficiary.address)).to.equal(
      benBefore + half,
    );
    // treasury is the same signer as owner; difference reflects the remainder
    expect(await ethers.provider.getBalance(treasury.address)).to.be.greaterThan(
      treaBefore + half - ethers.parseEther("0.01"),
    );
  });

  it("double-slash is impossible", async () => {
    const { pool, registry, beneficiary } = await deploy();
    await pool.connect(registry).lockStake(ROOT, STAKE, { value: STAKE });
    await pool.connect(registry).slashByDispute(ROOT, beneficiary.address, STAKE);
    await expect(
      pool.connect(registry).slashByDispute(ROOT, beneficiary.address, 1),
    ).to.be.revertedWithCustomError(pool, "StakeNotLocked");
  });

  it("unlock requires window expiry and pays 99/1 to treasury/pool", async () => {
    const { pool, registry, treasury, stranger } = await deploy();
    await pool.connect(registry).lockStake(ROOT, STAKE, { value: STAKE });

    // unlock is permissionless — call from a stranger so the gas cost doesn't
    // perturb the treasury balance (which is also the owner signer here).
    await expect(pool.connect(stranger).unlock(ROOT)).to.be.revertedWithCustomError(
      pool,
      "StillLocked",
    );

    await time.increase(30 * 24 * 60 * 60 + 1);
    const treaBefore = await ethers.provider.getBalance(treasury.address);
    const poolAddr = await pool.getAddress();

    await expect(pool.connect(stranger).unlock(ROOT)).to.emit(pool, "StakeReleased");

    const expectedTreasury = (STAKE * 9900n) / 10000n;
    const expectedRetained = STAKE - expectedTreasury;
    expect(await ethers.provider.getBalance(treasury.address)).to.equal(
      treaBefore + expectedTreasury,
    );
    expect(await ethers.provider.getBalance(poolAddr)).to.equal(expectedRetained);

    await expect(pool.unlock(ROOT)).to.be.revertedWithCustomError(pool, "StakeNotLocked");
  });

  it("stakeOf reverts on unknown rootHash", async () => {
    const { pool } = await deploy();
    await expect(pool.stakeOf(ROOT)).to.be.revertedWithCustomError(pool, "UnknownStake");
  });
});
