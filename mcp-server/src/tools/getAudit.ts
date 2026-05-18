/** getAudit — read-only registry lookup. SCAFFOLD — implement in T23. */
type ToolResult = { content: { type: "text"; text: string }[] };

export async function getAudit(address: string): Promise<ToolResult> {
  // TODO(T23): read MantleProofRegistry.getAudit(address) via the engine.
  return {
    content: [{ type: "text", text: `SCAFFOLD: getAudit(${address}) not implemented (T23)` }],
  };
}
