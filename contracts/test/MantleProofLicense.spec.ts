import { expect } from "chai";
import { ethers } from "hardhat";

const PRICE = ethers.parseEther("0.1");
const SUB = ethers.parseEther("1");

describe("MantleProofLicense", () => {
  async function deploy() {
    const [owner, payer, inftOwner, target] = await ethers.getSigners();
    const id = await (await ethers.getContractFactory("MockIdentityRegistry")).deploy();
    const rep = await (await ethers.getContractFactory("MockReputationRegistry")).deploy();
    const agent = await (
      await ethers.getContractFactory("MantleProofAgent")
    ).deploy(await id.getAddress(), await rep.getAddress(), 1, owner.address);
    const treasury = await (
      await ethers.getContractFactory("TreasurySplit")
    ).deploy(owner.address);
    const lic = await (
      await ethers.getContractFactory("MantleProofLicense")
    ).deploy(
      await agent.getAddress(),
      await treasury.getAddress(),
      PRICE,
      SUB,
      owner.address,
    );
    await id.setAgent(1, inftOwner.address, "ipfs://card");
    return { lic, treasury, owner, payer, inftOwner, target };
  }

  it("payForAudit splits 80/20 to iNFT owner / treasury", async () => {
    const { lic, treasury, payer, inftOwner, target } = await deploy();
    const before = await ethers.provider.getBalance(inftOwner.address);

    await expect(lic.connect(payer).payForAudit(target.address, { value: PRICE }))
      .to.emit(lic, "AuditPaid")
      .withArgs(payer.address, target.address, PRICE);

    const ownerCut = (PRICE * 8000n) / 10000n;
    expect(await ethers.provider.getBalance(inftOwner.address)).to.equal(
      before + ownerCut,
    );
    expect(await ethers.provider.getBalance(await treasury.getAddress())).to.equal(
      PRICE - ownerCut,
    );
  });

  it("reverts on insufficient payment", async () => {
    const { lic, payer, target } = await deploy();
    await expect(
      lic.connect(payer).payForAudit(target.address, { value: PRICE - 1n }),
    ).to.be.revertedWithCustomError(lic, "InsufficientPayment");
  });

  it("subscribe grants/extends a license", async () => {
    const { lic, payer } = await deploy();
    expect(await lic.isLicensed(payer.address)).to.equal(false);
    await lic.connect(payer).subscribe({ value: SUB });
    expect(await lic.isLicensed(payer.address)).to.equal(true);
    const e1 = await lic.licenseExpiry(payer.address);
    await lic.connect(payer).subscribe({ value: SUB });
    expect(await lic.licenseExpiry(payer.address)).to.be.greaterThan(e1);
  });

  it("mintLicense is admin-only", async () => {
    const { lic, owner, payer } = await deploy();
    await expect(
      lic.connect(payer).mintLicense(payer.address, 9_999_999_999),
    ).to.be.revertedWithCustomError(lic, "OwnableUnauthorizedAccount");
    await lic.connect(owner).mintLicense(payer.address, 9_999_999_999);
    expect(await lic.isLicensed(payer.address)).to.equal(true);
  });
});
