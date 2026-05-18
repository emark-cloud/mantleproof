/** Shared helpers: getAudit / payForAudit / decision-log. SCAFFOLD — T26-28. */
export async function getAudit(_target: string): Promise<unknown> {
  throw new Error("SCAFFOLD: getAudit (T27/T28)");
}

export async function payForAudit(_target: string): Promise<string> {
  throw new Error("SCAFFOLD: payForAudit (T26)");
}

export async function logDecision(
  _target: string,
  _auditRootHash: string,
  _action: string,
  _reason: string,
): Promise<string> {
  throw new Error("SCAFFOLD: logDecision (T27/T28)");
}
