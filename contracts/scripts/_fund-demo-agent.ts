/**
 * Send MNT from the deployer wallet to a demo-agent wallet (T26/T27/T28).
 * Usage:
 *   pnpm exec hardhat run scripts/_fund-demo-agent.ts --network mantleSepolia
 *     -- recipient + amount via env: FUND_TO, FUND_MNT (defaults: deployer-agent, 5)
 */
import { ethers, network } from "hardhat";

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  const to = (process.env.FUND_TO ?? "0x4354d518eD2060b315995E68268f019C074fc1f3").trim();
  const amt = process.env.FUND_MNT ?? "5";
  if (!ethers.isAddress(to)) throw new Error(`bad recipient: ${to}`);

  const balBefore = await ethers.provider.getBalance(deployer.address);
  const toBefore = await ethers.provider.getBalance(to);
  console.log(
    `[fund] network=${network.name} from=${deployer.address} (${ethers.formatEther(balBefore)} MNT) ` +
      `-> to=${to} (${ethers.formatEther(toBefore)} MNT) amount=${amt}`,
  );

  const tx = await deployer.sendTransaction({
    to,
    value: ethers.parseEther(amt),
  });
  console.log(`[fund] tx=${tx.hash} — waiting…`);
  const rcpt = await tx.wait();
  if (!rcpt || rcpt.status !== 1) throw new Error("fund tx failed");

  const balAfter = await ethers.provider.getBalance(deployer.address);
  const toAfter = await ethers.provider.getBalance(to);
  console.log(
    `[fund] OK  from=${ethers.formatEther(balAfter)} MNT  to=${ethers.formatEther(toAfter)} MNT  block=${rcpt.blockNumber}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
