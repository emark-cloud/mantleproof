/**
 * `mantleproof verify` — live verification against Mantle mainnet.
 *
 * Every check is a real read against chainId 5000 (no hardcoded results). It
 * collapses "is this real?" into ~30 seconds of green checks. No wallet, no gas,
 * no private key — pure public reads.
 */
import {
  ADDR,
  AGENT_TOKEN_ID,
  CHAIN_ID,
  ENGINE_URL,
  EXPLORER,
  ORACLE_SIGNER,
  PREVIOUS_REGISTRY,
  KNOWN_TARGETS,
} from "./config.js";
import {
  disputeStatusName,
  getCode,
  getDispute,
  makeClient,
  readDisputeCount,
  readFeedbackCount,
  readOracleSigner,
  severityName,
  tryGetAudit,
  tryOwnerOf,
  type AuditReport,
} from "./chain.js";
import { PASS, FAIL, SKIP, row, shortHex, c } from "./ui.js";

interface CheckOutcome {
  ok: boolean;
  label: string;
  detail: string;
}

function ago(ts: bigint, nowSec: number): string {
  const s = nowSec - Number(ts);
  if (s < 0) return "just now";
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 129600) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export async function runVerify(): Promise<number> {
  const client = makeClient();
  const nowSec = Math.floor(Date.now() / 1000);

  console.log("");
  console.log(
    c.bold(
      `MantleProof — live verification against Mantle mainnet (chainId ${CHAIN_ID})`,
    ),
  );
  console.log("");

  const checks: CheckOutcome[] = [];
  const emit = (o: CheckOutcome) => {
    checks.push(o);
    console.log(row(o.ok ? PASS : FAIL, o.label, o.detail));
  };

  // 1 — Registry deployed + oracleSigner matches the expected immutable signer.
  try {
    const code = await getCode(client, ADDR.registry);
    const deployed = !!code && code !== "0x";
    const signer = deployed ? await readOracleSigner(client) : "0x";
    const signerOk = signer.toLowerCase() === ORACLE_SIGNER.toLowerCase();
    emit({
      ok: deployed && signerOk,
      label: "Registry deployed, oracleSigner matches",
      detail: `${shortHex(ADDR.registry)} (mantlescan ↗)`,
    });
  } catch (e) {
    emit({ ok: false, label: "Registry deployed, oracleSigner matches", detail: String(e) });
  }

  // 2 — MantleProof registered in Mantle's ERC-8004 Identity Registry.
  try {
    const owner = await tryOwnerOf(client, ADDR.identityRegistry, AGENT_TOKEN_ID);
    emit({
      ok: owner !== null,
      label: "Agent registered in ERC-8004 Identity",
      detail: owner
        ? `tokenId #${AGENT_TOKEN_ID} → owner ${shortHex(owner)}`
        : `tokenId #${AGENT_TOKEN_ID} not found`,
    });
  } catch (e) {
    emit({ ok: false, label: "Agent registered in ERC-8004 Identity", detail: String(e) });
  }

  // 3 — Demo audits are anchored on the staking-free registry (gas-only anchors).
  try {
    let anchored = 0;
    for (const target of KNOWN_TARGETS) {
      try {
        if (await tryGetAudit(client, target)) anchored++;
      } catch {
        /* read-flaky; best-effort count */
      }
    }
    emit({
      ok: anchored === KNOWN_TARGETS.length,
      label: "Demo audits anchored (staking-free, gas only)",
      detail: `${anchored}/${KNOWN_TARGETS.length} demo targets anchored on ${shortHex(ADDR.registry)}`,
    });
  } catch (e) {
    emit({ ok: false, label: "Demo audits anchored (staking-free, gas only)", detail: String(e) });
  }

  // 4 + 5 — Discover the most-recent anchored audit, read it back structured.
  let latest: { target: string; audit: AuditReport } | null = null;
  try {
    for (const target of KNOWN_TARGETS) {
      let a = null;
      try {
        a = await tryGetAudit(client, target);
      } catch {
        continue; // best-effort discovery; skip a target that's read-flaky
      }
      if (!a) continue;
      if (!latest || a.timestamp > latest.audit.timestamp) latest = { target, audit: a };
    }
    emit({
      ok: latest !== null,
      label: "Most recent audit anchored on-chain",
      detail: latest
        ? `rootHash ${shortHex(latest.audit.rootHash)} (${ago(latest.audit.timestamp, nowSec)})`
        : "no anchored audits found among known targets",
    });
    emit({
      ok: latest !== null,
      label: "getAudit() returns structured finding",
      detail: latest
        ? `target ${shortHex(latest.target)} → ${severityName(latest.audit.severity)}, Tier ${latest.audit.tier}`
        : "—",
    });
  } catch (e) {
    emit({ ok: false, label: "Most recent audit anchored on-chain", detail: String(e) });
    emit({ ok: false, label: "getAudit() returns structured finding", detail: "—" });
  }

  // 6 — The disputes layer was exercised on mainnet. Read from the PREVIOUS
  // registry: the dispute receipts are historical (economic slashing is now
  // roadmap on the staking-free registry), but the on-chain proof stands.
  try {
    // disputeCount() returns _disputes.length - 1 (id 0 is reserved); valid
    // disputeIds are 1..count inclusive.
    const count = await readDisputeCount(client, PREVIOUS_REGISTRY);
    let retracted: { id: bigint } | null = null;
    let resolvedTotal = 0;
    for (let i = 1n; i <= count; i++) {
      const d = await getDispute(client, i, PREVIOUS_REGISTRY);
      if (d.status !== 0) resolvedTotal++;
      if (d.status === 3 && !retracted) retracted = { id: i };
    }
    emit({
      ok: retracted !== null,
      label: "Disputes layer exercised on mainnet",
      detail: retracted
        ? `disputeId #${retracted.id} → ${disputeStatusName(3)} on prev. registry ${shortHex(PREVIOUS_REGISTRY)} (${resolvedTotal}/${count} resolved; slashing now roadmap)`
        : `${resolvedTotal}/${count} resolved, none RETRACTED`,
    });
  } catch (e) {
    emit({ ok: false, label: "Disputes layer exercised on mainnet", detail: String(e) });
  }

  // 7 — A paying customer left ERC-8004 reputation about MantleProof.
  try {
    const fb = await readFeedbackCount(client, ADDR.reputationRegistry, AGENT_TOKEN_ID);
    emit({
      ok: fb > 0,
      label: "ERC-8004 reputation recorded",
      detail: `${fb} feedback entr${fb === 1 ? "y" : "ies"} about agent #${AGENT_TOKEN_ID}`,
    });
  } catch (e) {
    emit({ ok: false, label: "ERC-8004 reputation recorded", detail: String(e) });
  }

  // Bonus (soft) — Tier 2 engine reachable. Only attempted when ENGINE_URL is
  // set; never counted toward the on-chain pass total, since the engine is
  // off-chain infra a judge need not run to trust the on-chain state.
  if (ENGINE_URL) {
    try {
      const res = await fetch(`${ENGINE_URL.replace(/\/$/, "")}/api/health`, {
        signal: AbortSignal.timeout(8_000),
      });
      const j = (await res.json()) as { engine?: string; network?: string };
      const healthy = res.ok && j.engine === "ok";
      console.log(
        row(healthy ? PASS : FAIL, "Tier 2 engine reachable", `engine=${j.engine ?? "?"} network=${j.network ?? "?"}`),
      );
    } catch (e) {
      console.log(row(SKIP, "Tier 2 engine reachable", `not reachable (${String(e)})`));
    }
  } else {
    console.log(row(SKIP, "Tier 2 engine reachable", "skipped — set ENGINE_URL to check"));
  }

  const passed = checks.filter((c) => c.ok).length;
  const total = checks.length;
  console.log("");
  if (passed === total) {
    console.log(
      "  " + c.green(c.bold(`${passed}/${total} checks passed. MantleProof is live on Mantle mainnet.`)),
    );
  } else {
    console.log(
      "  " + c.red(c.bold(`${passed}/${total} checks passed.`)) + c.dim(" Some reads failed — see above."),
    );
  }
  if (latest) {
    console.log(
      "  " +
        c.dim(`Full audit: ${EXPLORER}/address/${latest.target}  ·  rootHash ${latest.audit.rootHash}`),
    );
  }
  console.log("");
  return passed === total ? 0 : 1;
}
