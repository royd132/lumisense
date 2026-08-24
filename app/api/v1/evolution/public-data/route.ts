import { principalForRequest } from "../../../../lib/edge-auth";
import {
  getPublicDataSkillEvolutionState,
  promotePublicDataSkillEvolution,
  runPublicDataSkillEvolution,
} from "../../../../lib/edge-harness";
import { publicDataSkillEvolution } from "../../../../lib/public-data-skill";

export async function GET(request: Request) {
  const principal = await principalForRequest(request, { allowPublicDemo: true });
  if (!principal) {
    return Response.json(
      { code: 40001, message: "需要受信身份或公开演示站点", data: null },
      { status: 401 },
    );
  }
  return Response.json({
    code: 0,
    message: "ok",
    data: {
      loop: publicDataSkillEvolution,
      state: await getPublicDataSkillEvolutionState(),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const principal = await principalForRequest(request, { allowPublicDemo: true });
  if (!principal) {
    return Response.json(
      { code: 40001, message: "需要受信身份或公开演示站点", data: null },
      { status: 401 },
    );
  }
  const body = (await request.json().catch(() => null)) as
    | { action?: string; run_id?: string }
    | null;
  if (body?.action === "run") {
    return Response.json({
      code: 0,
      message: "公开数据影子闭环已完成，等待人工发布",
      data: await runPublicDataSkillEvolution(principal),
    });
  }
  if (body?.action === "promote" && body.run_id) {
    const promoted = await promotePublicDataSkillEvolution(body.run_id, principal);
    if (!promoted) {
      return Response.json(
        { code: 40401, message: "未找到可发布的 Skill 演化运行", data: null },
        { status: 404 },
      );
    }
    if ("forbidden" in promoted) {
      return Response.json(
        { code: 40301, message: "仅主管或管理员可发布 Skill", data: null },
        { status: 403 },
      );
    }
    if ("gate_failed" in promoted) {
      return Response.json(
        { code: 40901, message: "影子评测或回归门禁未通过", data: null },
        { status: 409 },
      );
    }
    return Response.json({ code: 0, message: "Skill 已发布", data: promoted });
  }
  return Response.json(
    { code: 40002, message: "action 仅支持 run 或 promote", data: null },
    { status: 400 },
  );
}
