export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const { getRun } = await import("../../../../lib/edge-harness");
  const run = await getRun(runId);
  if (!run) return Response.json({ detail: "run not found" }, { status: 404 });
  if (!run.result) {
    return Response.json(
      { detail: { status: run.status } },
      { status: 409 },
    );
  }
  return Response.json(run.result);
}
