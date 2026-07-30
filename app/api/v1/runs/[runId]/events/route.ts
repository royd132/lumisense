export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const { getEvents, getRun } = await import("../../../../../lib/edge-harness");
  if (!(await getRun(runId))) {
    return Response.json({ detail: "run not found" }, { status: 404 });
  }
  const events = await getEvents(runId);
  const body = events
    .map(
      (event) =>
        `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`,
    )
    .join("");
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
