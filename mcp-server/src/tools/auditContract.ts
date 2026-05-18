/** auditContract — cached audit or trigger paid audit. SCAFFOLD — implement in T23. */
type ToolResult = { content: { type: "text"; text: string }[] };

export async function auditContract(address: string): Promise<ToolResult> {
  // TODO(T23): const data = await callEngine(`/api/audit/${address}`); format as content.
  return {
    content: [{ type: "text", text: `SCAFFOLD: auditContract(${address}) not implemented (T23)` }],
  };
}
