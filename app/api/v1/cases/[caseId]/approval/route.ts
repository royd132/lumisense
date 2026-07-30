function principal(request: Request) {
  const authenticatedEmail = request.headers.get("oai-authenticated-user-email");
  if (authenticatedEmail) {
    return { agentId: authenticatedEmail, role: "SUPERVISOR" };
  }
  const url = new URL(request.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return {
      agentId: request.headers.get("x-agent-id") ?? "local_supervisor",
      role: request.headers.get("x-agent-role") ?? "SUPERVISOR",
    };
  }
  return null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  const identity = principal(request);
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
  const { approveRun } = await import("../../../../../lib/edge-harness");
  const result = await approveRun(caseId, payload, identity);
  if ("error" in result) {
    return Response.json({ detail: result.error }, { status: result.status });
  }
  return Response.json(result);
}
