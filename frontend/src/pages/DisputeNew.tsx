/**
 * /dispute/new — form for filing an on-chain dispute against a finding.
 *
 * Calls `MantleProofRegistry.submitDispute(rootHash, findingIndex, ipfsCID)`
 * via wagmi's useWriteContract. Optional counter-stake in MNT (forwarded as
 * msg.value). Honest cold state when the user's wallet isn't connected:
 * shows the connect button and an explanatory paragraph rather than a
 * disabled submit.
 *
 * No spinners (CLAUDE.md). Terminal-style status block while the tx is in
 * flight; a permanent receipt block (with mantlescan link) on confirmation.
 *
 * The 0.10 USDC anti-spam fee mentioned in docs/update.md §2.1 is OPTIONAL
 * here for the iNFT + deployer paths; humans can prepay on Base via the
 * existing x402 facilitator (T22). This page does not block submit on the
 * USDC receipt — the off-chain receipt is verified at resolution time.
 */
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { parseEther } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { Address } from "../components/primitives/Address";
import { EngineStatusFooter } from "../components/composite/EngineStatusFooter";
import {
  MANTLE_CHAIN_ID,
  REGISTRY_ADDRESS,
  registryAbi,
} from "../lib/contracts";

const ROOT_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export default function DisputeNew() {
  const [params] = useSearchParams();
  const { address, isConnected } = useAccount();
  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: MANTLE_CHAIN_ID,
  });

  const [rootHash, setRootHash] = useState<string>(params.get("root") ?? "");
  const [findingIndex, setFindingIndex] = useState<string>(params.get("idx") ?? "0");
  const [ipfs, setIpfs] = useState<string>("");
  const [counterStake, setCounterStake] = useState<string>("0");

  const valid = useMemo(() => {
    if (!ROOT_HASH_RE.test(rootHash)) return false;
    if (!/^\d+$/.test(findingIndex)) return false;
    if (!ipfs.trim()) return false;
    if (counterStake && !/^\d+(\.\d+)?$/.test(counterStake)) return false;
    return true;
  }, [rootHash, findingIndex, ipfs, counterStake]);

  function submit() {
    if (!valid) return;
    const value = counterStake && Number(counterStake) > 0 ? parseEther(counterStake) : 0n;
    writeContract({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: "submitDispute",
      args: [
        rootHash as `0x${string}`,
        BigInt(findingIndex),
        ipfs.trim(),
      ],
      value,
      chainId: MANTLE_CHAIN_ID,
    });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="border-b border-border-strong bg-panel px-4 py-2">
        <Link to="/app" className="font-mono text-[11px] text-text-secondary hover:text-accent">
          ← dashboard
        </Link>
      </nav>
      <main className="flex-1 px-4 py-4 max-w-3xl w-full mx-auto flex flex-col gap-4">
        <section className="panel px-4 py-4">
          <h1 className="font-mono text-lg text-text-primary">File a dispute</h1>
          <p className="mt-2 font-sans text-sm text-text-secondary">
            Challenge a specific finding in an existing Tier 2 audit. The oracle
            re-runs the Tier 2 reasoning pass with your counter-claim loaded into
            the prompt and posts DISMISSED / AMENDED / RETRACTED on-chain. A
            RETRACTED verdict transfers the audit's 2 MNT stake to your address.
            Permissionless: anyone can file (iNFT-holder agents, the audited
            contract's deployer, or any human via a 0.10 USDC anti-spam fee on Base).
          </p>
        </section>

        <section className="panel px-4 py-4 flex flex-col gap-3 font-mono text-[12px]">
          <Field label="rootHash (bytes32)" hint="0x… of the disputed audit (from /audit/:rootHash)">
            <input
              value={rootHash}
              onChange={(e) => setRootHash(e.target.value.trim())}
              spellCheck={false}
              placeholder="0x6a69e7d4…"
              className="w-full bg-bg-input border border-border-strong px-2 py-1 font-mono text-text-primary"
            />
          </Field>
          <Field label="findingIndex" hint="0-based index of the finding inside the audit's findings array">
            <input
              value={findingIndex}
              onChange={(e) => setFindingIndex(e.target.value.trim())}
              spellCheck={false}
              placeholder="0"
              className="w-full bg-bg-input border border-border-strong px-2 py-1 font-mono text-text-primary"
            />
          </Field>
          <Field label="counter-claim IPFS CID" hint="bafkrei… or full ipfs://… URI; engine reads via gateway">
            <input
              value={ipfs}
              onChange={(e) => setIpfs(e.target.value.trim())}
              spellCheck={false}
              placeholder="bafkrei…"
              className="w-full bg-bg-input border border-border-strong px-2 py-1 font-mono text-text-primary"
            />
          </Field>
          <Field label="counter-stake (MNT, optional)" hint="forwarded as msg.value; refunded on AMENDED/RETRACTED">
            <input
              value={counterStake}
              onChange={(e) => setCounterStake(e.target.value.trim())}
              spellCheck={false}
              placeholder="0"
              className="w-full bg-bg-input border border-border-strong px-2 py-1 font-mono text-text-primary"
            />
          </Field>

          <div className="flex items-center gap-4 mt-2">
            {!isConnected && (
              <span className="text-text-muted">
                connect a wallet to submit · disputes are oracle-resolved
              </span>
            )}
            {isConnected && address && (
              <span className="text-text-secondary text-[11px]">
                submitting as <Address value={address} chainId={MANTLE_CHAIN_ID} />
              </span>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={!valid || !isConnected || isPending || confirming}
              className="ml-auto px-3 py-1 border border-accent text-accent disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isPending ? "sign in wallet…" : confirming ? "broadcasting…" : "submit dispute"}
            </button>
          </div>
        </section>

        {(isPending || confirming || isSuccess || error) && (
          <section className="panel-hi px-4 py-3 font-mono text-[12px] flex flex-col gap-1">
            {isPending && <span className="text-text-secondary">awaiting wallet signature…</span>}
            {confirming && txHash && (
              <span className="text-text-secondary">
                broadcast · tx {txHash.slice(0, 18)}… (waiting confirmation)
              </span>
            )}
            {isSuccess && txHash && (
              <span className="text-sev-clean">
                ✓ dispute filed on-chain · tx{" "}
                <a
                  href={`https://mantlescan.xyz/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline break-all"
                >
                  {txHash}
                </a>
              </span>
            )}
            {error && (
              <span className="text-sev-high break-all">
                error · {(error as Error).message}
              </span>
            )}
          </section>
        )}
      </main>
      <EngineStatusFooter />
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
      {children}
      <span className="text-[10px] text-text-muted">{hint}</span>
    </label>
  );
}
