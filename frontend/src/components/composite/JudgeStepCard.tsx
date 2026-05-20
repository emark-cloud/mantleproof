/**
 * JudgeStepCard — docs/design.md §6.5.
 *
 * One step in the 6-step Judge Quick Evaluation flow. Each card carries one
 * verifiable artifact (a live URL, a Mantlescan address, a `cast call` command)
 * and lets the judge mark it complete. Completion is local-only; the goal is
 * the action they take, not state we persist.
 */
import { useState } from "react";

export interface JudgeStep {
  index: number;
  total: number;
  title: string;
  instruction: React.ReactNode;
  actions: { label: string; href?: string; copy?: string }[];
}

export function JudgeStepCard({ step }: { step: JudgeStep }) {
  const [done, setDone] = useState(false);
  return (
    <article className="panel px-4 py-4">
      <header className="flex items-baseline justify-between mb-2">
        <h3 className="font-mono text-xs uppercase tracking-wider text-text-muted">
          Step {step.index} of {step.total}
        </h3>
        <span className="font-mono text-[10px] text-text-muted">~30s</span>
      </header>
      <h4 className="font-sans text-md text-text-primary mb-2">{step.title}</h4>
      <div className="font-sans text-sm text-text-secondary leading-relaxed">{step.instruction}</div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {step.actions.map((a) => {
          if (a.href) {
            return (
              <a
                key={a.label}
                href={a.href}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs px-3 py-1.5 border border-accent text-accent hover:bg-accent-glow"
              >
                {a.label} ↗
              </a>
            );
          }
          if (a.copy) {
            return (
              <button
                key={a.label}
                onClick={() => navigator.clipboard.writeText(a.copy!)}
                className="font-mono text-xs px-3 py-1.5 border border-border-strong text-text-primary hover:border-accent hover:text-accent"
                title={a.copy}
              >
                copy: {a.label}
              </button>
            );
          }
          return null;
        })}
        <button
          onClick={() => setDone(!done)}
          className={`ml-auto font-mono text-xs px-3 py-1.5 border ${
            done ? "border-sev-clean text-sev-clean" : "border-border-strong text-text-secondary hover:border-accent"
          }`}
        >
          {done ? "✓ verified" : "mark verified"}
        </button>
      </div>
    </article>
  );
}
