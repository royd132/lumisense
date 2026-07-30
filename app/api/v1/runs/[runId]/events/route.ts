export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { canReadAllCases, principalForRequest } = await import(
    "../../../../../lib/edge-auth"
  );
  const principal = await principalForRequest(request);
  if (!principal) {
    return Response.json(
      { detail: "authenticated identity required" },
      { status: 401 },
    );
  }
  const scope = {
    email: principal.email,
    canReadAll: canReadAllCases(principal),
  };
  const { runId } = await context.params;
  const { getEventsAfter, getRun } = await import(
    "../../../../../lib/edge-harness"
  );
  if (!(await getRun(runId, scope))) {
    return Response.json({ detail: "run not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const lastEventId = Number(
    request.headers.get("last-event-id") ??
      new URL(request.url).searchParams.get("cursor") ??
      0,
  );
  const stream = new ReadableStream({
    async start(controller) {
      let cursor = Number.isFinite(lastEventId) ? Math.max(0, lastEventId) : 0;
      let polls = 0;
      try {
        controller.enqueue(encoder.encode("retry: 2000\n\n"));
        while (polls < 300 && !request.signal.aborted) {
          const events = await getEventsAfter(runId, cursor, scope);
          for (const event of events) {
            cursor = event.id;
            controller.enqueue(
              encoder.encode(
                `id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`,
              ),
            );
          }
          const run = await getRun(runId, scope);
          if (
            run &&
            [
              "WAITING_APPROVAL",
              "WAITING_SUPERVISOR",
              "COMPLETED",
              "FAILED",
            ].includes(run.status) &&
            events.length === 0
          ) {
            break;
          }
          polls += 1;
          if (polls % 100 === 0) {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch {
        controller.enqueue(
          encoder.encode(
            `event: failed\ndata: ${JSON.stringify({ message: "事件流读取失败" })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      "Connection": "keep-alive",
    },
  });
}
