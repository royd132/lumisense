import { buildCompetitionEvaluationReport } from "../../../lib/competition-eval";
import { principalForRequest } from "../../../lib/edge-auth";

export async function GET(request: Request) {
  const principal = await principalForRequest(request, { allowPublicDemo: true });
  if (!principal) {
    return Response.json(
      { detail: "authenticated identity required" },
      { status: 401 },
    );
  }
  return Response.json(buildCompetitionEvaluationReport(), {
    headers: {
      "Cache-Control": "private, max-age=60",
    },
  });
}
