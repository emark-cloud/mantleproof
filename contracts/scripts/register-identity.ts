/**
 * T5 — obtain MantleProof's Mantle-issued ERC-8004 identity tokenId.
 *
 * "Mantle issues every agent an ERC-8004 identity" = Mantle deployed the
 * canonical Identity Registry (Path A, T1b); identities are NOT pre-minted —
 * you self-register against it. This script calls `register()` on that
 * registry from the configured deployer/owner signer, captures the assigned
 * tokenId, and prints the exact `.env` line to set.
 *
 * Whoever owns the identity receives the MantleProofLicense 80/20 split
 * (`MantleProofAgent.ownerOf()` -> `identityRegistry.ownerOf(agentTokenId)`),
 * so the signer here IS MantleProof's canonical owner — confirm the printed
 * `owner` address is intentional before mainnet.
 *
 * IDEMPOTENT: if the wallet already owns an identity it does NOT mint a second
 * one — it recovers and prints the existing tokenId.
 *
 * Rehearse on Sepolia first (throwaway, different tokenId):
 *   pnpm exec hardhat run scripts/register-identity.ts --network mantleSepolia
 * Then, only when ready (the tokenId binds IMMUTABLY into MantleProofAgent):
 *   CONFIRM_MAINNET_REGISTER=1 \
 *     pnpm exec hardhat run scripts/register-identity.ts --network mantle
 *
 * Optional `MANTLEPROOF_AGENT_URI` sets the agent registration URI (an agent
 * card JSON: capabilities / endpoints / payment address; mutable later via
 * setAgentURI — bare register() is used if unset and is fine to start).
 */
import { ethers, network } from "hardhat";
import { registriesFor } from "../config/registries";

// Minimal slice of the verified IdentityRegistryUpgradeable implementation
// (0x7274e874ca62410a93bd8bf61c69d8045e399c02) — only what we call/read.
const IDENTITY_ABI = [
  "function register() returns (uint256)",
  "function register(string agentURI) returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function name() view returns (string)",
  "event Registered(uint256 agentId, string agentURI, address owner)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

async function main(): Promise<void> {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const [signer] = await ethers.getSigners();
  const owner = signer.address;

  const reg = registriesFor(chainId);
  const regAddr = process.env.MANTLE_IDENTITY_REGISTRY || reg.identityRegistry;
  const agentURI = process.env.MANTLEPROOF_AGENT_URI ?? "";

  const registry = new ethers.Contract(regAddr, IDENTITY_ABI, signer);
  const nftName = await registry.name().catch(() => "?");

  console.log(
    `[register-identity] network=${network.name} chainId=${chainId}\n` +
      `[register-identity] identityRegistry=${regAddr} (${nftName})\n` +
      `[register-identity] owner(signer)=${owner}\n` +
      `[register-identity] agentURI=${agentURI || "(none — bare register())"}`,
  );

  // 1. Idempotency / pre-issue check — never mint a second identity.
  const bal: bigint = await registry.balanceOf(owner);
  if (bal > 0n) {
    console.log(
      `[register-identity] wallet ALREADY owns ${bal} identity(ies) — ` +
        `NOT registering again. Recovering tokenId from the mint log…`,
    );
    const latest = await ethers.provider.getBlockNumber();
    const logs = await ethers.provider.getLogs({
      address: regAddr,
      topics: [
        ethers.id("Transfer(address,address,uint256)"),
        ethers.zeroPadValue("0x00", 32), // from = 0x0 (mint)
        ethers.zeroPadValue(owner, 32), // to = owner
      ],
      fromBlock: 0,
      toBlock: latest,
    });
    if (logs.length > 0) {
      const tokenId = BigInt(logs[logs.length - 1].topics[3]);
      console.log(`[register-identity] existing tokenId = ${tokenId}`);
      console.log(
        `\n  -> set in repo-root .env (chainId ${chainId}):\n` +
          `    MANTLEPROOF_AGENT_TOKEN_ID=${tokenId}\n`,
      );
    } else {
      console.log(
        "[register-identity] could not auto-recover the tokenId from logs — " +
          "inspect this wallet's holdings on the explorer and set it manually.",
      );
    }
    return;
  }

  // 2. Mainnet is irreversible and the tokenId binds IMMUTABLY into
  //    MantleProofAgent — require an explicit opt-in for chainId 5000.
  if (chainId === 5000 && process.env.CONFIRM_MAINNET_REGISTER !== "1") {
    throw new Error(
      `Refusing to register on Mantle MAINNET (5000) without ` +
        `CONFIRM_MAINNET_REGISTER=1. This mints a PERMANENT ERC-8004 identity ` +
        `to ${owner} whose tokenId binds immutably into MantleProofAgent. ` +
        `Rehearse on --network mantleSepolia first, then re-run with ` +
        `CONFIRM_MAINNET_REGISTER=1.`,
    );
  }

  // 3. Register (mints the identity NFT to `owner`).
  const tx = agentURI
    ? await registry["register(string)"](agentURI)
    : await registry["register()"]();
  console.log(`[register-identity] register tx=${tx.hash} — waiting…`);
  const rcpt = await tx.wait();
  if (!rcpt || rcpt.status !== 1) throw new Error("register tx failed");

  // 4. Recover the assigned tokenId from the receipt (register() returns
  //    uint256 but a tx exposes it only via the emitted events).
  const iface = new ethers.Interface(IDENTITY_ABI);
  let tokenId: bigint | null = null;
  for (const log of rcpt.logs) {
    let parsed;
    try {
      parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
    } catch {
      continue; // not one of our events
    }
    if (
      parsed?.name === "Registered" &&
      String(parsed.args.owner).toLowerCase() === owner.toLowerCase()
    ) {
      tokenId = BigInt(parsed.args.agentId);
      break;
    }
    if (
      parsed?.name === "Transfer" &&
      parsed.args.from === ethers.ZeroAddress &&
      String(parsed.args.to).toLowerCase() === owner.toLowerCase()
    ) {
      tokenId = BigInt(parsed.args.tokenId);
    }
  }
  if (tokenId === null) {
    throw new Error(
      `register tx ${rcpt.hash} mined but tokenId not found in logs — ` +
        `recover it from the explorer (Registered/Transfer event) manually.`,
    );
  }

  // 5. Sanity: the registry agrees this wallet owns it.
  const onchainOwner: string = await registry.ownerOf(tokenId);
  if (onchainOwner.toLowerCase() !== owner.toLowerCase()) {
    throw new Error(
      `ownerOf(${tokenId})=${onchainOwner} != ${owner} — unexpected; ` +
        `do NOT use this tokenId.`,
    );
  }

  console.log(
    `[register-identity] OK  tokenId=${tokenId}  owner=${owner}  ` +
      `tx=${rcpt.hash}  block=${rcpt.blockNumber}`,
  );
  console.log(
    `\n  -> set in repo-root .env (chainId ${chainId} — PER-CHAIN, do NOT ` +
      `reuse a Sepolia id on mainnet):\n` +
      `    MANTLEPROOF_AGENT_TOKEN_ID=${tokenId}\n`,
  );
  if (chainId === 5003) {
    console.log(
      "  (Sepolia rehearsal only — for the real T25 cutover re-run with " +
        "--network mantle + CONFIRM_MAINNET_REGISTER=1 to mint the MAINNET id.)",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
