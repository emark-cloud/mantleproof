import { Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Contract from "./pages/Contract";
import Agent from "./pages/Agent";
import Audit from "./pages/Audit";
import Judge from "./pages/Judge";

// Routes per docs/design.md §6. SCAFFOLD — pages built in Week 6.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/contract/:address" element={<Contract />} />
      <Route path="/agent/:tokenId" element={<Agent />} />
      <Route path="/audit/:rootHash" element={<Audit />} />
      <Route path="/judge" element={<Judge />} />
    </Routes>
  );
}
