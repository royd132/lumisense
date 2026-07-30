async function principal(request: Request) {
  const authenticatedEmail = request.headers.get("oai-authenticated-user-email");
  if (authenticatedEmail) {
    const { roleForUser } = await import("../../../../../lib/edge-harness");
    return {
      agentId: authenticatedEmail,
      role: await roleForUser(authenticatedEmail),
    };
  }
  const url = new URL(request.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return {
      agentId: request.headers.get("x-agent-id") ?? "local_agent",
      role: request.headers.get("x-agent-role") ?? "AGENT",
    };
  }
  return null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  const identity = await principal(request);
  if (!identity) {
    return Response.json({ detail: "authenticated identity required" }, { status: 401 });
  }
  const { caseId } = await context.params;
  const payload = (await request.json()) as {
    decision: "ACCEPT" | "EDIT" | "REJECT" | "ESCALATE";
    edited_reply?: string;
    reason?: string;
    approved_action_ids?: string[];
  };
  if (!["ACCEPT", "EDIT", "REJECT", "ESCALATE"].includes(payload.decision)) {
    return Response.json({ detail: "invalid decision" }, { status: 422 });
  }
  if (
    payload.approved_action_ids &&
    (!Array.isArray(payload.approved_action_ids) ||
      payload.approved_action_ids.length > 20 ||
      payload.approved_action_ids.some(
        (action) => typeof action !== "string" || action.length > 100,
      ))
  ) {
    return Response.json({ detail: "invalid action ids" }, { status: 422 });
  }
  const { approveRun } = await import("../../../../../lib/edge-harness");
  const result = await approveRun(caseId, payload, identity);
  if ("error" in result) {
    return Response.json({ detail: result.error }, { status: result.status });
  }
  return Response.json(result);
}
