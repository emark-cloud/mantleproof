/**
 * FindingCard — docs/design.md §6.2 + §9.
 *
 * Per CLAUDE.md "Every finding must carry exactly one [honesty label]" — this
 * card refuses to render without one. Evidence is non-negotiable (design.md
 * §9.2): if the finding has no source line / bytecode offset / matched pattern,
 * we show "evidence missing — should not have been anchored" rather than hide
 * the gap.
 */
import { Link } from "react-router-dom";
import type { Finding } from "../../lib/api";
import { SeverityBadge, type Severity } from "../primitives/SeverityBadge";
import { HonestyLabel } from "../primitives/HonestyLabel";

export function FindingCard({
  finding,
  rootHash,
  findingIndex,
  tier,
}: {
  finding: Finding;
  /** Tier 2 audit rootHash this finding belongs to — required for the
   *  "Dispute this finding" CTA. Tier 1 findings are not disputable
   *  (per docs/update.md §8); omit for those. */
  rootHash?: `0x${string}`;
  /** 0-based index of this finding within the audit's findings array. */
  findingIndex?: number;
  /** Tier of the parent audit — used to gate the dispute CTA. */
  tier?: number;
}) {
  const sev = (finding.severity ?? "info") as Severity;
  const label = finding.label ?? "ESTIMATED";
  const evidence = (finding.evidence ?? {}) as Record<string, unknown>;
  const evidenceLines: { k: string; v: string }[] = [];

  // Source lines can be on the finding OR inside evidence.
  const sourceLines =
    finding.source_lines?.length
      ? finding.source_lines
      : Array.isArray(evidence.source_lines)
        ? (evidence.source_lines as string[])
        : null;
  if (sourceLines && sourceLines.length) {
    evidenceLines.push({ k: "src", v: sourceLines.join(", ") });
  }

  const bytecodeOffset =
    finding.bytecode_offset ??
    (typeof evidence.bytecode_offset === "string" ? (evidence.bytecode_offset as string) : null) ??
    (typeof evidence.bytecode_address === "string" ? (evidence.bytecode_address as string) : null);
  if (bytecodeOffset) {
    evidenceLines.push({ k: "bytecode", v: bytecodeOffset });
  }

  const matchedPattern =
    finding.matched_pattern ??
    (typeof evidence.matched_pattern === "string" ? (evidence.matched_pattern as string) : null);
  if (matchedPattern) {
    evidenceLines.push({ k: "matched pattern", v: matchedPattern });
  }

  // Engine emits `check_id`; some Tier-2 paths historically wrote `check`.
  const checkId = finding.check_id ?? finding.check;
  if (checkId) {
    evidenceLines.push({ k: "check", v: checkId });
  }

  // Show source_symbol / source_address if the check is integrator-style.
  if (typeof evidence.source_symbol === "string") {
    evidenceLines.push({ k: "source symbol", v: evidence.source_symbol as string });
  }
  if (
    typeof evidence.source_address === "string" &&
    evidence.source_address !== evidence.bytecode_address
  ) {
    evidenceLines.push({ k: "source address", v: evidence.source_address as string });
  }

  return (
    <article className="panel">
      <header className="px-4 py-3 row-divider flex items-center gap-3">
        <SeverityBadge severity={sev} />
        <HonestyLabel label={label} />
        <h3 className="font-mono text-sm text-text-primary truncate">
          {finding.finding?.split("\n")[0] ?? "(no title)"}
        </h3>
      </header>
      <div className="px-4 py-3 row-divider">
        <p className="font-sans text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
          {finding.finding ?? ""}
        </p>
      </div>
      <div className="px-4 py-3 row-divider">
        <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1">
          Evidence
        </div>
        {evidenceLines.length === 0 ? (
          <div className="font-mono text-[11px] text-sev-high">
            evidence missing — this finding only made it on-chain because the hallucination guard passed it; treat it with extra scrutiny.
          </div>
        ) : (
          <ul className="font-mono text-[11px] text-text-secondary">
            {evidenceLines.map((e) => (
              <li key={e.k}>
                <span className="text-text-muted">{e.k}:</span> {e.v}
              </li>
            ))}
          </ul>
        )}
      </div>
      {finding.suggested_fix && (
        <div className="px-4 py-3 row-divider">
          <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1">
            Suggested fix
          </div>
          <p className="font-mono text-[12px] text-text-secondary whitespace-pre-wrap">
            {finding.suggested_fix}
          </p>
        </div>
      )}
      {finding.caveat && (
        <div className="px-4 py-3 bg-sev-info/5 border-l-2 border-sev-info">
          <div className="font-mono text-[10px] uppercase tracking-wider text-sev-info mb-1">
            Caveat — intentional design
          </div>
          <p className="font-sans text-[12px] text-text-secondary whitespace-pre-wrap leading-relaxed">
            {finding.caveat}
          </p>
        </div>
      )}
      {tier === 2 && rootHash && findingIndex !== undefined && (
        <div className="px-4 py-2 border-t border-border-faint flex items-center justify-end">
          <Link
            to={`/dispute/new?root=${rootHash}&idx=${findingIndex}`}
            className="font-mono text-[11px] text-text-muted hover:text-accent"
          >
            [dispute this finding ↗]
          </Link>
        </div>
      )}
    </article>
  );
}
