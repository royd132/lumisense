import { principalForRequest } from "../../../../lib/edge-auth";

const defaults = {
  lancome: {
    name: "Lancôme 兰蔻",
    keywords: ["优雅", "法式", "女性力量"],
    style: "精致、有温度",
    forbidden_words: ["亲", "宝宝", "家人们"],
  },
  loreal: {
    name: "L'Oréal Paris 巴黎欧莱雅",
    keywords: ["大众", "专业", "科技感"],
    style: "专业、可信",
    forbidden_words: ["小仙女", "姐妹们"],
  },
  lrp: {
    name: "La Roche-Posay 理肤泉",
    keywords: ["皮肤学", "温和", "安全感"],
    style: "严谨、克制",
    forbidden_words: ["立刻见效", "根治"],
  },
  ysl: {
    name: "YSL 圣罗兰",
    keywords: ["奢华", "大胆", "反叛"],
    style: "时尚、敢言",
    forbidden_words: ["亲民", "便宜", "好用不贵"],
  },
  kiehls: {
    name: "Kiehl's 科颜氏",
    keywords: ["药房背景", "成分党", "真实"],
    style: "真实、硬核",
    forbidden_words: ["颜值", "氛围感"],
  },
  shu: {
    name: "Shu Uemura 植村秀",
    keywords: ["匠人", "卸妆专家", "专业彩妆"],
    style: "专业、艺术感",
    forbidden_words: ["平价", "学生党"],
  },
  maybelline: {
    name: "Maybelline 美宝莲",
    keywords: ["纽约", "平价彩妆", "时尚潮流"],
    style: "活泼、年轻",
    forbidden_words: ["贵妇", "奢华", "高端"],
  },
};

function unauthorized(status: 401 | 403, message: string) {
  return Response.json(
    { code: status === 401 ? 40001 : 40003, message, data: null },
    { status },
  );
}

export async function GET(request: Request) {
  const principal = await principalForRequest(request);
  if (!principal) return unauthorized(401, "需要登录后访问");
  if (principal.role !== "ADMIN") return unauthorized(403, "仅 AI 管理员可配置品牌人设");
  const brand = new URL(request.url).searchParams.get("brand") ?? "lancome";
  if (!(brand in defaults)) {
    return Response.json(
      { code: 40101, message: "未知品牌", data: null },
      { status: 400 },
    );
  }
  const { getLumisenseConfig } = await import("../../../../lib/edge-harness");
  const stored = await getLumisenseConfig(`brand_persona:${brand}`);
  return Response.json({
    code: 0,
    message: "ok",
    data: stored ?? { value: defaults[brand as keyof typeof defaults] },
  });
}

export async function PUT(request: Request) {
  const principal = await principalForRequest(request);
  if (!principal) return unauthorized(401, "需要登录后访问");
  if (principal.role !== "ADMIN") return unauthorized(403, "仅 AI 管理员可配置品牌人设");
  const body = (await request.json().catch(() => null)) as {
    brand?: string;
    keywords?: unknown;
    style?: unknown;
    forbidden_words?: unknown;
  } | null;
  if (
    !body?.brand ||
    !(body.brand in defaults) ||
    !Array.isArray(body.keywords) ||
    typeof body.style !== "string" ||
    !Array.isArray(body.forbidden_words) ||
    body.keywords.some((item) => typeof item !== "string") ||
    body.forbidden_words.some((item) => typeof item !== "string")
  ) {
    return Response.json(
      { code: 40101, message: "品牌人设参数不完整", data: null },
      { status: 400 },
    );
  }
  const base = defaults[body.brand as keyof typeof defaults];
  const value = {
    name: base.name,
    keywords: body.keywords.slice(0, 10),
    style: body.style.slice(0, 200),
    forbidden_words: body.forbidden_words.slice(0, 30),
  };
  const { updateLumisenseConfig } = await import(
    "../../../../lib/edge-harness"
  );
  const data = await updateLumisenseConfig(
    principal,
    `brand_persona:${body.brand}`,
    value,
  );
  return Response.json({ code: 0, message: "ok", data: { ...data, value } });
}
