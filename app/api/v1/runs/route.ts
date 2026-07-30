import type { RunInput } from "../../../lib/carepulse-api";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as RunInput;
    if (!input.text?.trim() || !input.conversation_id || !input.customer_id) {
      return Response.json({ detail: "invalid run input" }, { status: 422 });
    }
    const { createRun } = await import("../../../lib/edge-harness");
    return Response.json(await createRun(input), { status: 202 });
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "run creation failed" },
      { status: 500 },
    );
  }
}
