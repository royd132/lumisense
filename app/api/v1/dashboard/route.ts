import {
  canReadAllCases,
  principalForRequest,
} from "../../../lib/edge-auth";

export async function GET(request: Request) {
  const principal = await principalForRequest(request);
  if (!principal) {
    return Response.json(
      { detail: "authenticated identity required" },
      { status: 401 },
    );
  }
  const { getDashboard } = await import("../../../lib/edge-harness");
  return Response.json(
    await getDashboard({
      email: principal.email,
      canReadAll: canReadAllCases(principal),
    }),
    { headers: { "Cache-Control": "no-store" } },
  );
}
