export async function POST(
  request: Request,
  context: { params: Promise<{ feedbackId: string }> },
) {
  const { principalForRequest } = await import(
    "../../../../../../lib/edge-auth"
  );
  const principal = await principalForRequest(request, { allowPublicDemo: true });
  if (!principal) {
    return Response.json({ code: 40001, message: "需要登录后访问", data: null }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    decision?: "approve" | "reject";
    correction?: string;
  } | null;
  if (!body?.decision || !["approve", "reject"].includes(body.decision)) {
    return Response.json({ code: 40101, message: "复核参数不完整", data: null }, { status: 400 });
  }
  const { feedbackId } = await context.params;
  const { reviewLumisenseFeedback } = await import(
    "../../../../../../lib/edge-harness"
  );
  const data = await reviewLumisenseFeedback(feedbackId, principal, {
    decision: body.decision,
    correction: body.correction,
  });
  if (!data) {
    return Response.json({ code: 40401, message: "待复核反馈不存在或已处理", data: null }, { status: 404 });
  }
  return Response.json({ code: 0, message: "ok", data });
}
