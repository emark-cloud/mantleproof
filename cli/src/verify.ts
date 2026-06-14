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

/**
 * Wall-clock budget for the whole run. The per-request timeout + bounded retries
 * (chain.ts) keep any single read short; this is the backstop that guarantees
 * `verify` fails fast with an actionable message instead of hanging for minutes
 * when the public RPC degrades. Override the RPC with MANTLE_RPC_URL to recover.
 */
const DEADLINE_MS = 45_000;

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

  // Every read below is independent, so they run concurrently and the run is
  // bounded by the single slowest read rather than their sum. `latest` and the
  // engine line are produced alongside the counted checks.
  type Latest = { target: string; audit: AuditReport } | null;

  // 1 — Registry deployed + oracleSigner matches the expected immutable signer.
  const check1 = async (): Promise<CheckOutcome> => {
    try {
      const code = await getCode(client, ADDR.registry);
      const deployed = !!code && code !== "0x";
      const signer = deployed ? await readOracleSigner(client) : "0x";
      const signerOk = signer.toLowerCase() === ORACLE_SIGNER.toLowerCase();
      return {
        ok: deployed && signerOk,
        label: "Registry deployed, oracleSigner matches",
        detail: `${shortHex(ADDR.registry)} (mantlescan ↗)`,
      };
    } catch (e) {
      return { ok: false, label: "Registry deployed, oracleSigner matches", detail: String(e) };
    }
  };

  // 2 — MantleProof registered in Mantle's ERC-8004 Identity Registry.
  const check2 = async (): Promise<CheckOutcome> => {
    try {
      const owner = await tryOwnerOf(client, ADDR.identityRegistry, AGENT_TOKEN_ID);
      return {
        ok: owner !== null,
        label: "Agent registered in ERC-8004 Identity",
        detail: owner
          ? `tokenId #${AGENT_TOKEN_ID} → owner ${shortHex(owner)}`
          : `tokenId #${AGENT_TOKEN_ID} not found`,
      };
    } catch (e) {
      return { ok: false, label: "Agent registered in ERC-8004 Identity", detail: String(e) };
    }
  };

  // 3 + 4 + 5 — Read each known target's audit ONCE (in parallel), then derive
  // the anchored count, the most-recent audit, and the structured read-back from
  // that single set of reads. A read that throws is treated as "read-flaky" (not
  // "unaudited") and simply doesn't count toward the anchored total.
  const checks345 = async (): Promise<{
    outcomes: [CheckOutcome, CheckOutcome, CheckOutcome];
    latest: Latest;
  }> => {
    const results = await Promise.all(
      KNOWN_TARGETS.map(async (target) => {
        try {
          return { target, audit: await tryGetAudit(client, target) };
        } catch {
          return { target, audit: null as AuditReport | null };
        }
      }),
    );
    let anchored = 0;
    let latest: Latest = null;
    for (const r of results) {
      if (!r.audit) continue;
      anchored++;
      if (!latest || r.audit.timestamp > latest.audit.timestamp) {
        latest = { target: r.target, audit: r.audit };
      }
    }
    const outcomes: [CheckOutcome, CheckOutcome, CheckOutcome] = [
      {
        ok: anchored === KNOWN_TARGETS.length,
        label: "Demo audits anchored (staking-free, gas only)",
        detail: `${anchored}/${KNOWN_TARGETS.length} demo targets anchored on ${shortHex(ADDR.registry)}`,
      },
      {
        ok: latest !== null,
        label: "Most recent audit anchored on-chain",
        detail: latest
          ? `rootHash ${shortHex(latest.audit.rootHash)} (${ago(latest.audit.timestamp, nowSec)})`
          : "no anchored audits found among known targets",
      },
      {
        ok: latest !== null,
        label: "getAudit() returns structured finding",
        detail: latest
          ? `target ${shortHex(latest.target)} → ${severityName(latest.audit.severity)}, Tier ${latest.audit.tier}`
          : "—",
      },
    ];
    return { outcomes, latest };
  };

  // 6 — The disputes layer was exercised on mainnet. Read from the PREVIOUS
  // registry: the dispute receipts are historical (economic slashing is now
  // roadmap on the staking-free registry), but the on-chain proof stands.
  const check6 = async (): Promise<CheckOutcome> => {
    try {
      // disputeCount() returns _disputes.length - 1 (id 0 is reserved); valid
      // disputeIds are 1..count inclusive.
      const count = await readDisputeCount(client, PREVIOUS_REGISTRY);
      const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
      const disputes = await Promise.all(ids.map((id) => getDispute(client, id, PREVIOUS_REGISTRY)));
      const resolvedTotal = disputes.filter((d) => d.status !== 0).length;
      const retractedIdx = disputes.findIndex((d) => d.status === 3);
      const retractedId = retractedIdx >= 0 ? ids[retractedIdx] : null;
      return {
        ok: retractedId !== null,
        label: "Disputes layer exercised on mainnet",
        detail: retractedId
          ? `disputeId #${retractedId} → ${disputeStatusName(3)} on prev. registry ${shortHex(PREVIOUS_REGISTRY)} (${resolvedTotal}/${count} resolved; slashing now roadmap)`
          : `${resolvedTotal}/${count} resolved, none RETRACTED`,
      };
    } catch (e) {
      return { ok: false, label: "Disputes layer exercised on mainnet", detail: String(e) };
    }
  };

  // 7 — A paying customer left ERC-8004 reputation about MantleProof.
  const check7 = async (): Promise<CheckOutcome> => {
    try {
      const fb = await readFeedbackCount(client, ADDR.reputationRegistry, AGENT_TOKEN_ID);
      return {
        ok: fb > 0,
        label: "ERC-8004 reputation recorded",
        detail: `${fb} feedback entr${fb === 1 ? "y" : "ies"} about agent #${AGENT_TOKEN_ID}`,
      };
    } catch (e) {
      return { ok: false, label: "ERC-8004 reputation recorded", detail: String(e) };
    }
  };

  // Bonus (soft) — Tier 2 engine reachable. Only attempted when ENGINE_URL is
  // set; never counted toward the on-chain pass total, since the engine is
  // off-chain infra a judge need not run to trust the on-chain state.
  const checkEngine = async (): Promise<string> => {
    if (!ENGINE_URL) return row(SKIP, "Tier 2 engine reachable", "skipped — set ENGINE_URL to check");
    try {
      const res = await fetch(`${ENGINE_URL.replace(/\/$/, "")}/api/health`, {
        signal: AbortSignal.timeout(8_000),
      });
      const j = (await res.json()) as { engine?: string; network?: string };
      const healthy = res.ok && j.engine === "ok";
      return row(healthy ? PASS : FAIL, "Tier 2 engine reachable", `engine=${j.engine ?? "?"} network=${j.network ?? "?"}`);
    } catch (e) {
      return row(SKIP, "Tier 2 engine reachable", `not reachable (${String(e)})`);
    }
  };

  // Run the checks SEQUENTIALLY under a single wall-clock budget, emitting each
  // row as it resolves (incremental green checks). Sequential — not parallel —
  // is deliberate: the public RPC rate-limits concurrent bursts, so firing all
  // reads at once triggers backoff retries and is markedly SLOWER end-to-end.
  // The deadline below is the backstop: if the RPC stalls, it wins the race and
  // we report it instead of hanging for minutes.
  const TIMEOUT = Symbol("timeout");
  const checks: CheckOutcome[] = [];
  const work = (async (): Promise<Latest> => {
    const emit = (o: CheckOutcome) => {
      checks.push(o);
      console.log(row(o.ok ? PASS : FAIL, o.label, o.detail));
    };
    emit(await check1());
    emit(await check2());
    const c345 = await checks345();
    c345.outcomes.forEach(emit);
    emit(await check6());
    emit(await check7());
    console.log(await checkEngine());
    return c345.latest;
  })();
  const timeout = new Promise<typeof TIMEOUT>((resolve) =>
    setTimeout(() => resolve(TIMEOUT), DEADLINE_MS),
  );
  const outcome = await Promise.race([work, timeout]);

  if (outcome === TIMEOUT) {
    console.log("");
    console.log(
      row(FAIL, "verification timed out", `no response within ${Math.round(DEADLINE_MS / 1000)}s — the RPC is slow or unreachable`),
    );
    console.log("");
    console.log(
      "  " +
        c.red(c.bold("Verification did not complete.")) +
        c.dim(" Retry, or point at a faster RPC: MANTLE_RPC_URL=<url> npx mantleproof verify"),
    );
    console.log("");
    return 1;
  }

  const latest = outcome;
  const passed = checks.filter((o) => o.ok).length;
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
