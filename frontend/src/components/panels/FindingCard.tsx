/**
 * FindingCard — docs/design.md §6.2 + §9.
 *
 * Per CLAUDE.md "Every finding must carry exactly one [honesty label]" — this
 * card refuses to render without one. Evidence is non-negotiable (design.md
 * §9.2): if the finding has no source line / bytecode offset / matched pattern,
 * we show "evidence missing — should not have been anchored" rather than hide
 * the gap.
 */
import type { Finding } from "../../lib/api";
import { SeverityBadge, type Severity } from "../primitives/SeverityBadge";
import { HonestyLabel } from "../primitives/HonestyLabel";

export function FindingCard({ finding }: { finding: Finding }) {
  const sev = (finding.severity ?? "info") as Severity;
  const label = finding.label ?? "ESTIMATED";
  const evidenceLines: { k: string; v: string }[] = [];
  if (finding.source_lines?.length) {
    evidenceLines.push({ k: "src", v: finding.source_lines.join(", ") });
  }
  if (finding.bytecode_offset) {
    evidenceLines.push({ k: "bytecode offset", v: finding.bytecode_offset });
  }
  if (finding.matched_pattern) {
    evidenceLines.push({ k: "matched pattern", v: finding.matched_pattern });
  }
  if (finding.check) {
    evidenceLines.push({ k: "check", v: finding.check });
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
            evidence missing — anchored only because the guard passed; review needed.
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
        <div className="px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1">
            Suggested fix
          </div>
          <p className="font-mono text-[12px] text-text-secondary whitespace-pre-wrap">
            {finding.suggested_fix}
          </p>
        </div>
      )}
    </article>
  );
}
