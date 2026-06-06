/**
 * `mantleproof check 0x…` — audit any Mantle contract, no wallet required.
 *
 * Reads the latest anchored audit for the target from `MantleProofRegistry`
 * (free Tier 1 / Tier 2 read), fetches the full report from IPFS, re-derives the
 * on-chain `rootHash` from the bytes (trustless integrity), and prints the
 * structured findings with their honesty labels. The deeper paid Tier 2 path
 * (via x402 / `payForAudit`) is pointed to, not invoked — `check` never spends.
 */
import { getAddress, isAddress } from "viem";
import { ADDR, EXPLORER, CHAIN_ID } from "./config.js";
import { makeClient, tryGetAudit, severityName } from "./chain.js";
import { fetchReport, checkIntegrity, type Finding, type IntegrityStatus } from "./report.js";
import { c, shortHex } from "./ui.js";

function sevColor(sev: string): (s: string) => string {
  const s = sev.toUpperCase();
  if (s === "HIGH") return c.red;
  if (s === "MEDIUM") return c.yellow;
  if (s === "LOW") return c.cyan;
  return c.dim;
}

function renderFinding(f: Finding): string {
  const sev = (f.severity ?? "INFO").toUpperCase().padEnd(6);
  const label = `[${(f.label ?? "LABELED").toUpperCase()}]`.padEnd(12);
  const title = f.finding ?? f.sub_detector ?? f.check_id ?? "(finding)";
  let out = `  ${sevColor(f.severity ?? "")(sev)} ${c.dim(label)} ${title}`;
  const ev =
    typeof f.evidence === "string"
      ? f.evidence
      : f.evidence
        ? Object.entries(f.evidence as Record<string, unknown>)
            .map(([k, v]) => `${k}=${v}`)
            .join("  ")
        : "";
  if (ev) out += `\n${c.dim("                       " + ev)}`;
  return out;
}

export async function runCheck(rawAddr: string | undefined): Promise<number> {
  if (!rawAddr || !isAddress(rawAddr)) {
    console.error(c.red(`error: expected a contract address, got ${rawAddr ?? "(nothing)"}`));
    console.error(c.dim("usage: mantleproof check 0x<40-hex-address>"));
    return 2;
  }
  const target = getAddress(rawAddr);
  const client = makeClient();

  console.log("");
  console.log(`Auditing ${target} on Mantle mainnet…`);

  const audit = await tryGetAudit(client, target);
  if (!audit) {
    console.log("");
    console.log(c.yellow("  No audit anchored for this contract yet."));
    console.log(
      c.dim(
        `  Request a deep Tier 2 audit (0.5 MNT via payForAudit, or x402):\n` +
          `    payForAudit(${shortHex(target)}) → ${ADDR.license}\n` +
          `  Then re-run: mantleproof check ${target}`,
      ),
    );
    console.log("");
    return 1;
  }

  // Trustless integrity: re-derive the on-chain rootHash from the IPFS bytes.
  let body;
  let gateway = "";
  let integrity: IntegrityStatus | "unavailable" = "unavailable";
  try {
    const fetched = await fetchReport(audit.ipfsCID);
    body = fetched.body;
    gateway = fetched.gateway;
    integrity = checkIntegrity(fetched.raw, body, audit.rootHash).status;
  } catch (e) {
    console.log(c.dim(`  (IPFS report unavailable: ${String(e)} — showing on-chain anchor only)`));
  }

  const sev = severityName(audit.severity);
  console.log(
    c.dim(`  ${body?.contract_name ? body.contract_name + "  ·  " : ""}Tier ${audit.tier}  ·  overall ${sevColor(sev)(sev)}`),
  );
  console.log("");

  const findings = body?.findings ?? [];
  if (findings.length === 0) {
    console.log(c.dim("  No individual findings in the report (clean, or anchor-only)."));
  } else {
    for (const f of findings) console.log(renderFinding(f));
  }

  if (body?.hallucination_guard?.public_note) {
    console.log("");
    console.log(c.dim(`  ${body.hallucination_guard.public_note}`));
  }

  console.log("");
  const tierLine =
    audit.tier === 1
      ? `  Tier 1 (free) read complete. For deep Tier 2 analysis (0.5 MNT): pay via x402 / payForAudit.`
      : `  Tier 2 (deep) audit — staked, disputable on-chain.`;
  console.log(c.dim(tierLine));

  const host = gateway ? new URL(gateway).host : "ipfs";
  if (integrity === "rederived") {
    console.log(c.green(`  ✓ integrity verified — recomputed keccak256 of the IPFS bytes == on-chain rootHash (via ${host})`));
  } else if (integrity === "anchored") {
    console.log(c.green(`  ✓ anchor verified — report's root_hash == on-chain rootHash, from the content-addressed CID (via ${host})`));
    console.log(c.dim(`    (independent keccak re-derivation isn't reproducible for audits pinned before the 2026-05-24 canonicalization fix)`));
  } else if (integrity === "mismatch") {
    console.log(c.red(`  ✗ integrity MISMATCH — IPFS report's root_hash disagrees with the on-chain anchor`));
  } else {
    console.log(c.dim(`  rootHash ${shortHex(audit.rootHash)}  ·  CID ${audit.ipfsCID}`));
  }
  console.log(c.dim(`  Full report: ${EXPLORER}/address/${target}  (chainId ${CHAIN_ID})`));
  console.log("");

  return integrity === "mismatch" ? 1 : 0;
}
