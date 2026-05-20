import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Contract from "./pages/Contract";
import Agent from "./pages/Agent";
import Audit from "./pages/Audit";
import Judge from "./pages/Judge";

// Routes — landing at `/`, dashboard at `/app`. The spec (`docs/design.md`
// §1.3 + §12) originally locked `/` as the dashboard; that's overridden for
// the submission window (see TODO.md Decisions log 2026-05-20).
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<Dashboard />} />
      <Route path="/contract/:address" element={<Contract />} />
      <Route path="/agent/:tokenId" element={<Agent />} />
      <Route path="/audit/:rootHash" element={<Audit />} />
      <Route path="/judge" element={<Judge />} />
    </Routes>
  );
}
