import { principalForRequest } from "../../../../lib/edge-auth";

export async function GET(request: Request) {
  const principal = await principalForRequest(request);
  if (!principal) {
    return Response.json(
      { code: 40001, message: "需要登录后访问", data: null },
      { status: 401 },
    );
  }
  if (principal.role !== "ADMIN") {
    return Response.json(
      { code: 40003, message: "仅 AI 管理员可导出训练数据", data: null },
      { status: 403 },
    );
  }
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 20);
  const { getLumisenseFeedbackQueue } = await import(
    "../../../../lib/edge-harness"
  );
  return Response.json({
    code: 0,
    message: "ok",
    data: {
      disclaimer: "仅包含人工反馈候选；导出前仍需脱敏与人工复核。",
      items: await getLumisenseFeedbackQueue(limit),
    },
  });
}
