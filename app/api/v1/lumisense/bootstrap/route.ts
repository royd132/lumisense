import { principalForRequest } from "../../../../lib/edge-auth";
import {
  coldStartStats,
  riskMetrics,
  roleProfiles,
  scenarioInputs,
  scenarios,
} from "../../../../lib/lumisense-demo";

export async function GET(request: Request) {
  const principal = await principalForRequest(request);
  if (!principal) {
    return Response.json(
      { code: 40001, message: "需要登录后访问", data: null },
      { status: 401 },
    );
  }
  return Response.json(
    {
      code: 0,
      message: "ok",
      data: {
        product: {
          name: "LumiSense 感光 v2.0",
          philosophy: ["Sense", "Respond", "Resolve", "Measure"],
          north_star: "AI-Assisted FCR +15pp",
        },
        principal: {
          email: principal.email,
          role: principal.role,
        },
        roles: roleProfiles,
        cold_start: coldStartStats,
        scenario_count: Object.keys(scenarios).length,
        scenarios: Object.entries(scenarios).map(([key, item]) => ({
          key,
          title: item.title,
          consumer: item.consumer.name,
          risk: item.perception.risk,
          input: scenarioInputs[key as keyof typeof scenarioInputs],
        })),
        risk_metrics: riskMetrics,
        knowledge: {
          beauty_scenarios: 12,
          emotion_turning_points: 5,
          ingredients: "50+",
          brands: 7,
        },
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
