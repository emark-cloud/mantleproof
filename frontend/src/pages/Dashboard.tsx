/**
 * Homepage / Dashboard — docs/design.md §6.1.
 *
 * Three-column shell: deploy feed (left, skinny) · priority cache (middle, wide)
 * · agent queries (right, skinny). HeroStrip on top, EngineStatusFooter on
 * bottom. Pure composition of primitives + panels.
 */
import { Link } from "react-router-dom";
import { HeroStrip } from "../components/composite/HeroStrip";
import { EngineStatusFooter } from "../components/composite/EngineStatusFooter";
import { DeployFeedPanel } from "../components/panels/DeployFeedPanel";
import { PriorityCachePanel } from "../components/panels/PriorityCachePanel";
import { AgentQueryPanel } from "../components/panels/AgentQueryPanel";
import { Logomark } from "../components/primitives/Logomark";

export default function Dashboard() {
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      <main className="flex-1 px-3 py-3 flex flex-col gap-3">
        <HeroStrip />
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_300px] gap-3 flex-1 min-h-[60vh]">
          <DeployFeedPanel />
          <PriorityCachePanel />
          <AgentQueryPanel />
        </div>
      </main>
      <EngineStatusFooter />
    </div>
  );
}

function NavBar() {
  return (
    <nav className="border-b border-border-strong bg-panel px-4 py-2 flex items-center gap-4">
      <Link to="/" className="flex items-center gap-2 font-mono text-sm font-semibold text-accent tracking-wider">
        <Logomark size={20} />
        MANTLEPROOF
      </Link>
      <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">
        audit oracle · Mantle mainnet
      </span>
      <div className="ml-auto flex items-center gap-3 text-[11px] font-mono text-text-secondary">
        <a href="https://github.com/" target="_blank" rel="noreferrer" className="hover:text-accent">
          [github]
        </a>
        <Link to="/agent/96" className="hover:text-accent">[agent]</Link>
        <Link to="/judge" className="hover:text-accent">[/judge]</Link>
      </div>
    </nav>
  );
}
