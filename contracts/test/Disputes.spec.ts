import { expect } from "chai";
import { ethers } from "hardhat";

const TIER1 = 1;
const TIER2 = 2;
const HIGH = 3;
const ROOT_T1 = ethers.keccak256(ethers.toUtf8Bytes("root-t1"));
const ROOT_T2 = ethers.keccak256(ethers.toUtf8Bytes("root-t2"));
const REAUDIT = ethers.keccak256(ethers.toUtf8Bytes("reaudit"));
const COUNTER = ethers.parseEther("0.1");

// DisputeStatus enum mirror
const PENDING = 0;
const DISMISSED = 1;
const AMENDED = 2;
const RETRACTED = 3;

// Staking deactivated (roadmap): the registry no longer takes a StakingPool and
// submitAudit is nonpayable. Disputes still file/resolve and the disputer's
// optional counter-stake is refunded on RETRACTED/AMENDED — but there is no
// audit-stake slash (that economic layer is future work).
async function deploy() {
  const [owner, oracle, target, disputer, stranger] = await ethers.getSigners();
  const Reg = await ethers.getContractFactory("MantleProofRegistry");
  const reg = await Reg.connect(owner).deploy(oracle.address, owner.address);

  // Pre-seed: one Tier 2 audit (for dispute happy path) + one Tier 1 (for guard).
  await reg.connect(oracle).submitAudit(target.address, TIER2, HIGH, ROOT_T2, "cid-t2");
  await reg.connect(oracle).submitAudit(target.address, TIER1, HIGH, ROOT_T1, "cid-t1");
  return { reg, owner, oracle, target, disputer, stranger };
}

describe("MantleProofRegistry — disputes", () => {
  it("Tier 1 audits are NOT disputable", async () => {
    const { reg, disputer } = await deploy();
    await expect(
      reg.connect(disputer).submitDispute(ROOT_T1, 0, "ipfs://cc"),
    ).to.be.revertedWithCustomError(reg, "Tier1NotDisputable");
  });

  it("unknown rootHash reverts UnknownAudit", async () => {
    const { reg, disputer } = await deploy();
    await expect(
      reg
        .connect(disputer)
        .submitDispute(ethers.keccak256(ethers.toUtf8Bytes("nope")), 0, "ipfs://cc"),
    ).to.be.revertedWithCustomError(reg, "UnknownAudit");
  });

  it("submitDispute is permissionless and emits with the disputer", async () => {
    const { reg, disputer } = await deploy();
    await expect(
      reg.connect(disputer).submitDispute(ROOT_T2, 1, "ipfs://cc", { value: COUNTER }),
    )
      .to.emit(reg, "DisputeSubmitted")
      .withArgs(1, ROOT_T2, 1, disputer.address, "ipfs://cc", COUNTER);

    expect(await reg.disputeCount()).to.equal(1n);
    const ids = await reg.getDisputesForRoot(ROOT_T2);
    expect(ids.length).to.equal(1);
    expect(ids[0]).to.equal(1n);

    const d = await reg.getDispute(1);
    expect(d.disputer).to.equal(disputer.address);
    expect(d.status).to.equal(PENDING);
    expect(d.counterStake).to.equal(COUNTER);
  });

  it("only the oracle can resolveDispute", async () => {
    const { reg, oracle, disputer, stranger } = await deploy();
    await reg.connect(disputer).submitDispute(ROOT_T2, 0, "ipfs://cc", { value: COUNTER });
    await expect(
      reg.connect(stranger).resolveDispute(1, DISMISSED, ethers.ZeroHash),
    ).to.be.revertedWithCustomError(reg, "NotOracleSigner");

    await expect(reg.connect(oracle).resolveDispute(1, DISMISSED, ethers.ZeroHash))
      .to.emit(reg, "DisputeResolved")
      .withArgs(1, ROOT_T2, DISMISSED, ethers.ZeroHash);

    const d = await reg.getDispute(1);
    expect(d.status).to.equal(DISMISSED);
  });

  it("resolveDispute(PENDING) is rejected as InvalidOutcome", async () => {
    const { reg, oracle, disputer } = await deploy();
    await reg.connect(disputer).submitDispute(ROOT_T2, 0, "ipfs://cc");
    await expect(
      reg.connect(oracle).resolveDispute(1, PENDING, ethers.ZeroHash),
    ).to.be.revertedWithCustomError(reg, "InvalidOutcome");
  });

  it("RETRACTED refunds the counter-stake (audit-stake slashing is roadmap)", async () => {
    const { reg, oracle, disputer } = await deploy();
    await reg.connect(disputer).submitDispute(ROOT_T2, 0, "ipfs://cc", { value: COUNTER });

    const before = await ethers.provider.getBalance(disputer.address);
    await expect(reg.connect(oracle).resolveDispute(1, RETRACTED, REAUDIT)).to.emit(
      reg,
      "DisputeResolved",
    );

    // Disputer is refunded the counter-stake only — no audit stake to slash.
    const after = await ethers.provider.getBalance(disputer.address);
    expect(after - before).to.equal(COUNTER);

    const d = await reg.getDispute(1);
    expect(d.status).to.equal(RETRACTED);
    expect(d.reAuditRootHash).to.equal(REAUDIT);
  });

  it("AMENDED refunds the counter-stake", async () => {
    const { reg, oracle, disputer } = await deploy();
    await reg.connect(disputer).submitDispute(ROOT_T2, 0, "ipfs://cc", { value: COUNTER });

    const before = await ethers.provider.getBalance(disputer.address);
    await reg.connect(oracle).resolveDispute(1, AMENDED, REAUDIT);
    const after = await ethers.provider.getBalance(disputer.address);

    expect(after - before).to.equal(COUNTER); // counter-stake refund
  });

  it("DISMISSED forfeits the counter-stake (registry retains it)", async () => {
    const { reg, oracle, disputer } = await deploy();
    await reg.connect(disputer).submitDispute(ROOT_T2, 0, "ipfs://cc", { value: COUNTER });

    const regAddr = await reg.getAddress();
    const before = await ethers.provider.getBalance(regAddr);
    await reg.connect(oracle).resolveDispute(1, DISMISSED, ethers.ZeroHash);
    const after = await ethers.provider.getBalance(regAddr);
    expect(after - before).to.equal(0n); // counter-stake was already in registry
    expect(await ethers.provider.getBalance(regAddr)).to.equal(COUNTER);
  });

  it("cannot resolve the same dispute twice", async () => {
    const { reg, oracle, disputer } = await deploy();
    await reg.connect(disputer).submitDispute(ROOT_T2, 0, "ipfs://cc");
    await reg.connect(oracle).resolveDispute(1, DISMISSED, ethers.ZeroHash);
    await expect(
      reg.connect(oracle).resolveDispute(1, AMENDED, ethers.ZeroHash),
    ).to.be.revertedWithCustomError(reg, "DisputeNotPending");
  });

  it("unknown disputeId reverts", async () => {
    const { reg, oracle } = await deploy();
    await expect(
      reg.connect(oracle).resolveDispute(99, DISMISSED, ethers.ZeroHash),
    ).to.be.revertedWithCustomError(reg, "UnknownDispute");
    // id 0 is reserved
    await expect(
      reg.connect(oracle).resolveDispute(0, DISMISSED, ethers.ZeroHash),
    ).to.be.revertedWithCustomError(reg, "UnknownDispute");
  });

  it("owner can sweep forfeited DISMISSED counter-stakes", async () => {
    const { reg, owner, oracle, disputer, stranger } = await deploy();
    await reg.connect(disputer).submitDispute(ROOT_T2, 0, "ipfs://cc", { value: COUNTER });
    await reg.connect(oracle).resolveDispute(1, DISMISSED, ethers.ZeroHash);

    await expect(reg.connect(stranger).sweepForfeited(stranger.address))
      .to.be.revertedWithCustomError(reg, "OwnableUnauthorizedAccount");

    const destBefore = await ethers.provider.getBalance(stranger.address);
    await reg.connect(owner).sweepForfeited(stranger.address);
    expect(await ethers.provider.getBalance(stranger.address)).to.equal(
      destBefore + COUNTER,
    );
  });
});
