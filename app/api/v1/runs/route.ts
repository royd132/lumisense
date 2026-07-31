import type { RunInput } from "../../../lib/carepulse-api";
import { principalForRequest } from "../../../lib/edge-auth";

export async function POST(request: Request) {
  try {
    const principal = await principalForRequest(request);
    if (!principal) {
      return Response.json(
        { detail: "authenticated identity required" },
        { status: 401 },
      );
    }
    const input = (await request.json()) as RunInput;
    if (
      typeof input.text !== "string" ||
      !input.text.trim() ||
      input.text.length > 8000 ||
      typeof input.conversation_id !== "string" ||
      !input.conversation_id.trim() ||
      input.conversation_id.length > 80 ||
      typeof input.customer_id !== "string" ||
      !input.customer_id.trim() ||
      input.customer_id.length > 80 ||
      (input.order_id !== undefined &&
        (typeof input.order_id !== "string" || input.order_id.length > 80)) ||
      (input.product_id !== undefined &&
        (typeof input.product_id !== "string" || input.product_id.length > 80)) ||
      (input.contact_count !== undefined &&
        (!Number.isInteger(input.contact_count) ||
          input.contact_count < 1 ||
          input.contact_count > 100)) ||
      (input.previous_promise_overdue !== undefined &&
        typeof input.previous_promise_overdue !== "boolean")
    ) {
      return Response.json({ detail: "invalid run input" }, { status: 422 });
    }
    const { createRun } = await import("../../../lib/edge-harness");
    return Response.json(await createRun(input, principal.email), {
      status: 202,
    });
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "run creation failed" },
      { status: 500 },
    );
  }
}
