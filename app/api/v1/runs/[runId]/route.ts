export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { canReadAllCases, principalForRequest } = await import(
    "../../../../lib/edge-auth"
  );
  const principal = await principalForRequest(request);
  if (!principal) {
    return Response.json(
      { detail: "authenticated identity required" },
      { status: 401 },
    );
  }
  const { runId } = await context.params;
  const { getRun } = await import("../../../../lib/edge-harness");
  const run = await getRun(runId, {
    email: principal.email,
    canReadAll: canReadAllCases(principal),
  });
  if (!run) return Response.json({ detail: "run not found" }, { status: 404 });
  if (!run.result) {
    return Response.json(
      { detail: { status: run.status } },
      { status: 409 },
    );
  }
  return Response.json(run.result);
}
