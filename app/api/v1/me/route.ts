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
  return Response.json({
    email: principal.email,
    display_name: principal.displayName,
    role: principal.role,
    can_read_all_cases: canReadAllCases(principal),
  });
}
