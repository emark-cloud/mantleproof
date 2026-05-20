#!/usr/bin/env node
/**
 * Local stdio smoke for mantleproof-mcp (T23).
 *
 * Spawns the built server (build/index.js) as a subprocess, sends a few MCP
 * JSON-RPC frames over stdin, and pretty-prints the responses. NOT a CI test —
 * it talks to a live engine (mainnet RPC + Pinata) and exists so the MCP
 * surface can be exercised end-to-end before publishing to npm.
 *
 * Prereqs:
 *   - run `pnpm build` first
 *   - run the engine REST API locally OR set MANTLEPROOF_API_BASE to a remote
 *
 * The engine in this repo loads its registry address from the deployments
 * file, so the easiest way to run it locally is:
 *   cd ../engine && . .venv/bin/activate
 *   MANTLE_NETWORK=mantle \
 *     MANTLEPROOF_REGISTRY_ADDRESS=0x60E97c83Dd184D3B0812Ce25430e9D6930eD63aE \
 *     uvicorn mantleproof.main:app --host 127.0.0.1 --port 8000
 *
 * then in another shell:
 *   cd mcp-server && node scripts/smoke_stdio.mjs
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(__dirname, "..", "build", "index.js");

const TARGETS = [
  // Demo 1 — BuggyYieldVault, expected HIGH
  "0x1892f77e335C133Ce4a7B28555f13bA74cBB76fA",
  // Demo 3 — Merchant Moe LBRouter, expected INFO
  "0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a",
  // Unaudited
  "0x0000000000000000000000000000000000000000",
];

const child = spawn("node", [BIN], {
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env },
});

const rl = createInterface({ input: child.stdout });
const pending = new Map();
let nextId = 1;

rl.on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    console.error("[non-json]", line);
    return;
  }
  if (msg.id && pending.has(msg.id)) {
    const { resolve } = pending.get(msg.id);
    pending.delete(msg.id);
    resolve(msg);
  } else {
    // notification — log briefly
    console.error("[note]", JSON.stringify(msg).slice(0, 200));
  }
});

function send(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout: ${method}`));
      }
    }, 30_000);
  });
}

function summarize(resp) {
  if (resp.error) return `ERROR ${resp.error.code}: ${resp.error.message}`;
  const c = resp.result?.content;
  if (!c) return JSON.stringify(resp.result).slice(0, 200);
  const text = c.find((b) => b.type === "text")?.text ?? "";
  return text.split("\n").slice(0, 8).join("\n");
}

async function main() {
  // 1. initialize handshake
  await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mantleproof-smoke", version: "0" },
  });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  await sleep(50);

  // 2. list_tools
  const tools = await send("tools/list", {});
  const names = (tools.result?.tools ?? []).map((t) => t.name).sort();
  console.log(`[tools] ${names.join(", ")}`);
  if (JSON.stringify(names) !== JSON.stringify(["auditContract", "getAudit", "requestAudit"])) {
    throw new Error(`unexpected tool list: ${names.join(",")}`);
  }

  // 3. call each tool against each target
  for (const target of TARGETS) {
    console.log(`\n=== getAudit(${target}) ===`);
    const r1 = await send("tools/call", { name: "getAudit", arguments: { address: target } });
    console.log(summarize(r1));

    console.log(`\n=== auditContract(${target}) ===`);
    const r2 = await send("tools/call", {
      name: "auditContract",
      arguments: { address: target, tier: 2 },
    });
    console.log(summarize(r2));
  }

  // requestAudit on unaudited target must invoke the x402 endpoint and return
  // the payment requirements (the 402 dance). It must NOT fabricate a tx.
  console.log(`\n=== requestAudit(0x0…0) (expect 402 dance — payment requirements) ===`);
  const r3 = await send("tools/call", {
    name: "requestAudit",
    arguments: { address: "0x0000000000000000000000000000000000000000", tier: 2 },
  });
  const txt = r3.result?.content?.find((b) => b.type === "text")?.text ?? "";
  const isError = r3.result?.isError ?? false;
  console.log(`isError=${isError}`);
  console.log(txt.split("\n").slice(0, 5).join("\n"));
  if (isError) throw new Error("requestAudit returned isError after T11 — engine unreachable?");
  if (!txt.includes("USDC") || !txt.includes("base")) {
    throw new Error("requestAudit did not surface the 402 payment requirements");
  }
  if (txt.match(/tx[: =]0x[a-f0-9]{64}/i)) {
    throw new Error("requestAudit returned a tx hash without an actual payment — fabrication!");
  }

  // requestAudit on an already-audited target must short-circuit to the cache.
  console.log(`\n=== requestAudit(Demo 1 vault) (expect cache hit) ===`);
  const r4 = await send("tools/call", {
    name: "requestAudit",
    arguments: { address: TARGETS[0], tier: 2 },
  });
  const t4 = r4.result?.content?.find((b) => b.type === "text")?.text ?? "";
  console.log(t4.split("\n").slice(0, 2).join("\n"));
  if (!t4.includes("cached audit found")) {
    throw new Error("requestAudit should short-circuit to cache when target already audited");
  }

  child.kill();
  console.log(
    "\n[smoke] OK — 3 tools advertised, getAudit live, requestAudit returns 402 requirements (no fabricated tx), cache short-circuit works",
  );
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  child.kill();
  process.exit(1);
});
