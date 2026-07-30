export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  const { principalForRequest } = await import(
    "../../../../../lib/edge-auth"
  );
  const identity = await principalForRequest(request);
  if (!identity) {
    return Response.json({ detail: "authenticated identity required" }, { status: 401 });
  }
  const { caseId } = await context.params;
  const payload = (await request.json()) as {
    decision:
      | "ACCEPT"
      | "EDIT"
      | "REJECT"
      | "ESCALATE"
      | "REQUEST_ESCALATION";
    edited_reply?: string;
    reason?: string;
    approved_action_ids?: string[];
  };
  if (
    ![
      "ACCEPT",
      "EDIT",
      "REJECT",
      "ESCALATE",
      "REQUEST_ESCALATION",
    ].includes(payload.decision)
  ) {
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
  if (
    (payload.edited_reply !== undefined &&
      (typeof payload.edited_reply !== "string" ||
        payload.edited_reply.length > 8000)) ||
    (payload.reason !== undefined &&
      (typeof payload.reason !== "string" || payload.reason.length > 2000))
  ) {
    return Response.json({ detail: "invalid approval text" }, { status: 422 });
  }
  const { approveRun } = await import("../../../../../lib/edge-harness");
  const result = await approveRun(caseId, payload, identity);
  if ("error" in result) {
    return Response.json({ detail: result.error }, { status: result.status });
  }
  return Response.json(result);
}
