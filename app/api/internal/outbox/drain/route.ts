import {
  isSupervisor,
  principalForRequest,
} from "../../../../lib/edge-auth";

export async function POST(request: Request) {
  const principal = await principalForRequest(request);
  if (!principal || !isSupervisor(principal)) {
    return Response.json({ detail: "supervisor required" }, { status: 403 });
  }
  const { drainOutbox } = await import("../../../../lib/edge-harness");
  return Response.json(await drainOutbox());
}
