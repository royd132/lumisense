import { principalForRequest } from "../../../../lib/edge-auth";

const VERDICTS = new Set(["accurate", "partially", "inaccurate"]);

export async function POST(request: Request) {
  const principal = await principalForRequest(request);
  if (!principal) {
    return Response.json(
      { code: 40001, message: "需要登录后访问", data: null },
      { status: 401 },
    );
  }
  if (principal.role === "VIEWER") {
    return Response.json(
      { code: 40003, message: "查看者不能提交训练反馈", data: null },
      { status: 403 },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    conversation_id?: string;
    feedback_type?: string;
    feedback_text?: string;
  } | null;
  if (
    !body?.conversation_id ||
    !body.feedback_type ||
    !VERDICTS.has(body.feedback_type)
  ) {
    return Response.json(
      { code: 40101, message: "反馈参数不完整", data: null },
      { status: 400 },
    );
  }
  const { recordLumisenseFeedback } = await import(
    "../../../../lib/edge-harness"
  );
  const data = await recordLumisenseFeedback(principal, {
    conversationId: body.conversation_id,
    feedbackType: "subtext",
    verdict: body.feedback_type as "accurate" | "partially" | "inaccurate",
    detail: body.feedback_text?.slice(0, 800),
  });
  return Response.json({ code: 0, message: "ok", data });
}
