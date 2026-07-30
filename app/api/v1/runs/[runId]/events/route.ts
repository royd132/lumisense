export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const { getEventsAfter, getRun } = await import(
    "../../../../../lib/edge-harness"
  );
  if (!(await getRun(runId))) {
    return Response.json({ detail: "run not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let cursor = 0;
      let polls = 0;
      try {
        while (polls < 300) {
          const events = await getEventsAfter(runId, cursor);
          for (const event of events) {
            cursor = event.id;
            controller.enqueue(
              encoder.encode(
                `id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`,
              ),
            );
          }
          const run = await getRun(runId);
          if (
            run &&
            ["WAITING_APPROVAL", "COMPLETED", "FAILED"].includes(run.status) &&
            events.length === 0
          ) {
            break;
          }
          polls += 1;
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
