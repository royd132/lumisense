import { principalForRequest } from "../../../../lib/edge-auth";
import {
  riskAlerts,
  riskMetrics,
  teamRanking,
} from "../../../../lib/lumisense-demo";

const ALLOWED = new Set(["VIEWER", "SUPERVISOR", "RISK_MANAGER", "ADMIN"]);

export async function GET(request: Request) {
  const principal = await principalForRequest(request);
  if (!principal) {
    return Response.json(
      { code: 40001, message: "需要登录后访问", data: null },
      { status: 401 },
    );
  }
  if (!ALLOWED.has(principal.role)) {
    return Response.json(
      {
        code: 40003,
        message: "当前角色无风险看板权限",
        data: null,
        trace_id: crypto.randomUUID(),
      },
      { status: 403 },
    );
  }
  const masked = principal.role === "VIEWER";
  return Response.json({
    code: 0,
    message: "ok",
    data: {
      generated_at: new Date().toISOString(),
      refresh_seconds: 5,
      radar: riskMetrics,
      color_map: Object.fromEntries(
        riskMetrics.map((item) => [item.label, item.tone]),
      ),
      active_alerts: riskAlerts.map((item) => ({
        ...item,
        detail: masked ? "会话 **** · 数据已脱敏" : item.detail,
      })),
      team_empathy_ranking: teamRanking.map((item) => ({
        ...item,
        name: masked ? `坐席 ${item.id}` : item.name,
      })),
      totals: { active_alerts: 30, red: 6, yellow: 24 },
    },
  });
}
