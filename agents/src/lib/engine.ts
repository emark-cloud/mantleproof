/**
 * Engine pipeline subprocess driver. The deployer-agent (and later, audit-
 * triggered flows) shell out to the Python engine for the heavy lift:
 * resolve verified source -> Tier-1 -> Tier-2 (live Gemini) -> guard ->
 * canonical rootHash -> IPFS pin -> on-chain `submitAudit`. The TS agent is
 * a chain-side orchestrator, NOT an audit signer (only the oracle-signer key
 * can write to the registry).
 *
 * Why a subprocess instead of an HTTP API? Hackathon scope: the engine is a
 * Python package, no service running 24/7 yet; spawning is the simplest seam
 * and mirrors how `engine/scripts/run_pipeline_*.py` is already operated by
 * hand during validation. Replaceable with a REST call (T22 x402) later
 * without changing the agent's external contract.
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import type { Hex } from "viem";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const ENGINE_DIR = resolve(REPO_ROOT, "engine");

export interface PipelineResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Parsed if the harness printed a `[run] rootHash=...` line. */
  rootHash?: Hex;
  /** Parsed if the harness printed `[run] ANCHORED ... anchor_tx=...`. */
  anchorTx?: Hex;
  ipfsUri?: string;
  severity?: string;
}

/** Run a single `engine/scripts/run_pipeline_<network>.py <target>` to completion.
 *
 * Inherits the parent's env (so `.env` loaded by python-settings is the same
 * one the agent reads). Streams stdout/stderr live so the demo is watchable.
 * Parses key fields from the harness's known prefixes -- the harness format
 * is part of its contract (`docs/mantleproof.md` -- live run reports).
 */
export async function runEnginePipeline(opts: {
  network: "mantle" | "mantleSepolia";
  target: `0x${string}`;
}): Promise<PipelineResult> {
  const scriptName =
    opts.network === "mantle" ? "run_pipeline_mantle.py" : "run_pipeline_sepolia.py";
  const script = resolve(ENGINE_DIR, "scripts", scriptName);
  if (!existsSync(script))
    throw new Error(`engine pipeline harness missing: ${script}`);

  const py = resolve(ENGINE_DIR, ".venv/bin/python");
  const interpreter = existsSync(py) ? py : "python3";

  return new Promise<PipelineResult>((resolvePromise, rejectPromise) => {
    const child = spawn(interpreter, ["-u", script, opts.target], {
      cwd: ENGINE_DIR,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b: Buffer) => {
      const s = b.toString();
      stdout += s;
      process.stdout.write(s); // live stream so the demo is watchable
    });
    child.stderr.on("data", (b: Buffer) => {
      const s = b.toString();
      stderr += s;
      process.stderr.write(s);
    });
    child.on("error", (e: Error) => rejectPromise(e));
    child.on("close", (code: number | null) => {
      const exitCode = code ?? -1;
      const rootHashMatch = stdout.match(/rootHash=(0x[0-9a-fA-F]{64})/);
      const anchorMatch = stdout.match(/anchor_tx=([0-9a-fA-F]{64})/);
      const ipfsMatch = stdout.match(/ipfs=(ipfs:\/\/[A-Za-z0-9]+)/);
      const sevMatch = stdout.match(/severity=([A-Za-z]+)/);
      resolvePromise({
        ok: exitCode === 0,
        exitCode,
        stdout,
        stderr,
        rootHash: rootHashMatch ? (rootHashMatch[1] as Hex) : undefined,
        anchorTx: anchorMatch ? (("0x" + anchorMatch[1]) as Hex) : undefined,
        ipfsUri: ipfsMatch ? ipfsMatch[1] : undefined,
        severity: sevMatch ? sevMatch[1] : undefined,
      });
    });
  });
}
