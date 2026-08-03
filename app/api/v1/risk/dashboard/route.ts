import { principalForRequest } from "../../../../lib/edge-auth";
import {
  consumerRiskCases,
  riskAlerts,
  riskMetrics,
  riskTypeBreakdown,
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
      consumer_risk_queue: consumerRiskCases.map((item, index) => ({
        ...item,
        consumer: masked ? `消费者 ${index + 1}` : item.consumer,
        evidence: masked ? "风险证据已脱敏" : item.evidence,
        owner: masked ? "负责人已脱敏" : item.owner,
      })),
      risk_type_breakdown: riskTypeBreakdown,
      sla: { critical_response_within_30s: 83, awaiting_supervisor: 4, overdue_promises: 7 },
      totals: { active_alerts: 30, red: 6, yellow: 24 },
    },
  });
}
