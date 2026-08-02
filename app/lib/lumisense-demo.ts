import type { ApiAnalysis, RunInput } from "./carepulse-api";

export type LumiRole =
  | "admin"
  | "supervisor"
  | "agent_senior"
  | "agent_junior"
  | "viewer";

export type LumiView = "workspace" | "risk" | "growth" | "evolution";

export type LumiScenarioKey =
  | "allergy"
  | "pregnancy"
  | "acne"
  | "gift"
  | "expectation"
  | "challenge";

export type DemoMessage = {
  by: "consumer" | "agent";
  text: string;
  time: string;
  imageLabel?: string;
};

export type ProphetPath = {
  key: "a" | "b" | "c";
  label: string;
  scores: number[];
  probability: number;
  tone: "danger" | "warning" | "success";
};

export type LumiInsight = {
  scenarioKey: LumiScenarioKey;
  consumer: {
    name: string;
    vip: string;
    skinType: string;
    personality: string;
    concern: string;
    allergies: string[];
    history: string;
  };
  brand: string;
  title: string;
  messages: DemoMessage[];
  perception: {
    intent: string;
    emotion: string;
    intensity: number;
    skin: string;
    product: string;
    risk: "green" | "yellow" | "red";
    riskLabel: string;
  };
  subtext: {
    surface: string;
    emotion: string;
    hidden: string;
    strategy: string;
    confidence: number;
  };
  observed: number[];
  paths: ProphetPath[];
  recommendationReason: string;
  scripts: { label: string; text: string; score: number }[];
  product: {
    name: string;
    brand: string;
    price: string;
    reason: string;
    ingredients: string[];
    alternatives: string[];
    guide: string;
    taboo: string;
    gated?: boolean;
  };
  empathy: {
    total: number;
    dims: [number, number, number, number, number];
    improvement: string;
  };
  riskSignals: string[];
  trace: {
    node: string;
    detail: string;
    latency: number;
    state: "done" | "warn";
  }[];
  runtime: ApiAnalysis["runtime"];
};

export const roleProfiles: Record<
  LumiRole,
  { name: string; label: string; level: string; description: string }
> = {
  admin: {
    name: "张管理",
    label: "AI 管理员",
    level: "L4",
    description: "品牌人设、知识库、训练数据与全量审计",
  },
  supervisor: {
    name: "李主管",
    label: "客服主管",
    level: "L3",
    description: "团队看板、预警处置与培训派发",
  },
  agent_senior: {
    name: "王资深",
    label: "资深客服",
    level: "L2",
    description: "高危会话、转接接管与误报反馈",
  },
  agent_junior: {
    name: "陈新手",
    label: "新手客服",
    level: "L1",
    description: "日常会话、建议采纳与个人成长",
  },
  viewer: {
    name: "赵查看",
    label: "查看者",
    level: "L0",
    description: "脱敏风险态势与个人共情分只读",
  },
};

export const roleViews: Record<LumiRole, LumiView[]> = {
  admin: ["workspace", "risk", "growth", "evolution"],
  supervisor: ["workspace", "risk", "growth", "evolution"],
  agent_senior: ["workspace", "growth"],
  agent_junior: ["workspace", "growth"],
  viewer: ["risk", "growth"],
};

const previewRuntime: ApiAnalysis["runtime"] = {
  harness: "EDGE_D1",
  model_mode: "STRUCTURED_FALLBACK",
  model: "正在验证运行时",
  fallback_reason: "awaiting_runtime",
  model_latency_ms: 0,
  input_tokens: 0,
  output_tokens: 0,
};

const baseTrace: LumiInsight["trace"] = [
  { node: "Sense / ingestion", detail: "上下文脱敏、画像与最近会话装载", latency: 42, state: "done" },
  { node: "Subtext fork", detail: "四层潜台词翻译完成", latency: 186, state: "done" },
  { node: "Risk fork", detail: "情绪拐点与硬规则并行检查", latency: 13, state: "warn" },
  { node: "Knowledge fork", detail: "成分禁忌、品牌人设与历史证据召回", latency: 158, state: "done" },
  { node: "Emotion prophet", detail: "未来三轮 A/B/C 路径计算完成", latency: 28, state: "done" },
  { node: "Reflect / review", detail: "禁用词、事实引用与动作权限校验", latency: 74, state: "done" },
];

const commonPaths: ProphetPath[] = [
  { key: "a", label: "继续当前话术", scores: [18, 12, 8], probability: 12, tone: "danger" },
  { key: "b", label: "标准安抚", scores: [28, 33, 38], probability: 45, tone: "warning" },
  { key: "c", label: "深度共情介入", scores: [42, 60, 78], probability: 87, tone: "success" },
];

export const scenarios: Record<Exclude<LumiScenarioKey, "challenge">, LumiInsight> = {
  allergy: {
    scenarioKey: "allergy",
    consumer: {
      name: "小美",
      vip: "VIP 3",
      skinType: "敏感肌",
      personality: "焦虑型",
      concern: "屏障受损",
      allergies: ["酒精", "香精"],
      history: "近 90 天购买 2 次 · 曾咨询敏感肌护理",
    },
    brand: "Lancôme 兰蔻",
    title: "过敏反应急救 · 高危",
    messages: [
      { by: "consumer", text: "用了你们家精华脸全红了怎么办😭", time: "09:23", imageLabel: "消费者上传 · 面颊泛红" },
      { by: "consumer", text: "会不会留疤啊，我是不是用错了？", time: "09:24" },
      { by: "agent", text: "我正在为您核对产品和安全处理建议，请先不要继续使用。", time: "09:24" },
      { by: "consumer", text: "算了不说了，反正你们家东西就那样。", time: "09:25" },
    ],
    perception: {
      intent: "过敏投诉 / 安全处置",
      emotion: "恐慌 + 自责",
      intensity: 0.85,
      skin: "屏障受损 · 急性期",
      product: "含酒精精华 · 已购",
      risk: "red",
      riskLabel: "极高风险",
    },
    subtext: {
      surface: "字面否定并结束沟通",
      emotion: "失望 0.70 · 隐忍愤怒 0.60",
      hidden: "担心皮肤受损又觉得没有被认真对待，正在考虑公开吐槽",
      strategy: "先承认恐慌与自责，再给安全动作和明确人工升级",
      confidence: 0.92,
    },
    observed: [45, 38, 30, 25],
    paths: commonPaths,
    recommendationReason: "情绪连续 3 轮下降；Path C 可把预计 R7 从 8 提升到 78。",
    scripts: [
      {
        label: "深度共情 · 推荐",
        text: "我能理解您现在既担心皮肤，也会怀疑是不是自己哪里做错了——这不是您的错。请先暂停使用；如果红肿持续或加重，请及时寻求专业医疗帮助。经您确认后，我会立即升级产品安全专员并持续跟进。",
        score: 88,
      },
      {
        label: "标准安抚 · 备选",
        text: "很抱歉给您带来担忧。请先暂停使用该产品，我们会记录症状、时间与产品批次，并由安全专员进一步跟进。",
        score: 73,
      },
    ],
    product: {
      name: "安全处置优先",
      brand: "不启动销售推荐",
      price: "人工复核",
      reason: "急性红肿属于安全场景；先停用、记录和升级，皮肤稳定前不做交叉销售。",
      ingredients: ["暂停当前精华", "记录批次", "就医提示"],
      alternatives: ["后续可评估 B5 修护", "后续可评估神经酰胺"],
      guide: "现在：停用 → 记录症状 → 人工安全升级",
      taboo: "不得诊断、归因或承诺治愈",
      gated: true,
    },
    empathy: {
      total: 88,
      dims: [94, 90, 86, 91, 76],
      improvement: "品牌契合度可进一步加入兰蔻式克制、优雅表达。",
    },
    riskSignals: ["明确红肿", "恐慌与自责", "放弃沟通前兆", "可能转向公开平台"],
    trace: baseTrace,
    runtime: previewRuntime,
  },
  pregnancy: {
    scenarioKey: "pregnancy",
    consumer: {
      name: "莉莉",
      vip: "VIP 5",
      skinType: "混合肌",
      personality: "理性成分党",
      concern: "孕期安全",
      allergies: [],
      history: "孕中期 · 最近浏览美白与抗老精华",
    },
    brand: "L'Oréal Paris 巴黎欧莱雅",
    title: "孕期成分咨询 · 高关注",
    messages: [
      { by: "consumer", text: "我怀孕 5 个月，这款 A 醇精华还能用吗？", time: "11:05" },
      { by: "consumer", text: "我不是要你推荐贵的，只想确认对宝宝安不安全。", time: "11:06" },
    ],
    perception: {
      intent: "孕期成分安全咨询",
      emotion: "焦虑 + 谨慎",
      intensity: 0.76,
      skin: "孕期 · 混合肌",
      product: "A 醇精华 · 禁忌核验",
      risk: "yellow",
      riskLabel: "高关注",
    },
    subtext: {
      surface: "询问孕期是否可使用 A 醇",
      emotion: "焦虑 0.76 · 防御 0.42",
      hidden: "最关心胎儿安全，也担心被销售话术带偏",
      strategy: "明确禁忌边界，停止推销，给低风险替代与专业咨询建议",
      confidence: 0.95,
    },
    observed: [62, 55, 49, 46],
    paths: [
      { key: "a", label: "继续讲功效", scores: [39, 31, 25], probability: 18, tone: "danger" },
      { key: "b", label: "仅提示停用", scores: [52, 58, 61], probability: 61, tone: "warning" },
      { key: "c", label: "安全清单 + 替代", scores: [61, 72, 84], probability: 91, tone: "success" },
    ],
    recommendationReason: "先给明确安全边界，再解释替代逻辑，能最大程度恢复信任。",
    scripts: [
      {
        label: "安全优先 · 推荐",
        text: "您谨慎确认是非常有必要的。孕期建议暂停使用含视黄醇（A 醇）的产品，也不需要为了护肤承担不确定风险。您可以把完整成分表发给我核对；日常保湿可优先考虑玻尿酸或胜肽类配方，并同步咨询产检医生。",
        score: 92,
      },
      {
        label: "简洁说明 · 备选",
        text: "孕期不建议使用 A 醇。建议先停用，并选择成分更简单的基础保湿产品；如有疑问请以医生建议为准。",
        score: 81,
      },
    ],
    product: {
      name: "玻尿酸保湿精华",
      brand: "巴黎欧莱雅",
      price: "¥319",
      reason: "避开视黄醇与高刺激活性物，匹配孕期的基础保湿诉求。",
      ingredients: ["玻尿酸", "无 A 醇", "精简保湿"],
      alternatives: ["胜肽精华", "B5 修护面霜"],
      guide: "先做局部测试，每晚 1 次，出现不适立即停用",
      taboo: "孕期禁用 A 醇；最终以医生意见为准",
    },
    empathy: { total: 92, dims: [95, 94, 92, 90, 84], improvement: "可补充完整成分表入口，降低信息不对称。" },
    riskSignals: ["孕中期", "视黄醇禁忌", "明确担心胎儿安全"],
    trace: baseTrace,
    runtime: previewRuntime,
  },
  acne: {
    scenarioKey: "acne",
    consumer: {
      name: "晓晓",
      vip: "VIP 1",
      skinType: "油痘肌",
      personality: "易怒型",
      concern: "使用后爆痘",
      allergies: [],
      history: "首次购买精华 · 7 天内连续使用",
    },
    brand: "La Roche-Posay 理肤泉",
    title: "爆痘投诉 · 风险升级",
    messages: [
      { by: "consumer", text: "用了七天爆了一脸痘，你们是不是虚假宣传？", time: "13:41" },
      { by: "consumer", text: "我真的很失望，白花钱了。", time: "13:42" },
    ],
    perception: { intent: "效果投诉 / 不良反应核验", emotion: "愤怒 + 失望", intensity: 0.82, skin: "油痘肌 · 活跃爆痘", product: "精华 · 连续使用 7 天", risk: "red", riskLabel: "高风险" },
    subtext: { surface: "质疑产品宣传并表达失望", emotion: "愤怒 0.82 · 被欺骗感 0.71", hidden: "希望品牌承认体验落差，而不是继续解释或推销", strategy: "先确认具体变化和时间线，再进入安全核验与售后路径", confidence: 0.9 },
    observed: [58, 48, 37, 29],
    paths: commonPaths,
    recommendationReason: "继续解释功效会放大被欺骗感；应先承认体验落差并核验症状。",
    scripts: [
      { label: "体验确认 · 推荐", text: "连续使用后出现明显爆痘，和您的期待完全相反，失望和生气都可以理解。请先暂停使用，我想先确认爆痘出现的部位、时间和是否伴随刺痛；确认后我们会进入安全核验与售后处理。", score: 90 },
      { label: "售后路径 · 备选", text: "很抱歉这次使用体验没有达到预期。我们先停止继续叠加产品，并核对订单、使用频率和症状变化，再给您明确的下一步。", score: 79 },
    ],
    product: { name: "暂停推荐", brand: "理肤泉", price: "安全核验中", reason: "活跃爆痘需要先区分刺激、闷痘与既往皮肤状态。", ingredients: ["暂停活性物", "温和清洁", "基础保湿"], alternatives: ["待症状稳定后评估 B5", "人工美容顾问复核"], guide: "停用涉事产品并记录 48 小时变化", taboo: "不得承诺根治或将爆痘归因于排毒", gated: true },
    empathy: { total: 90, dims: [92, 93, 87, 91, 82], improvement: "补充明确的跟进时间点，增强闭环感。" },
    riskSignals: ["明显爆痘", "虚假宣传质疑", "强烈失望"],
    trace: baseTrace,
    runtime: previewRuntime,
  },
  gift: {
    scenarioKey: "gift",
    consumer: { name: "王女士", vip: "VIP 4", skinType: "中性肌", personality: "送礼型", concern: "给妈妈选口红", allergies: [], history: "曾购买兰蔻礼盒 · 偏好稳妥色系" },
    brand: "YSL 圣罗兰",
    title: "送礼推荐 · 转化机会",
    messages: [
      { by: "consumer", text: "想送妈妈一支口红，怕颜色太年轻，也怕显黑。", time: "15:18" },
      { by: "consumer", text: "预算 400 左右，包装要体面一点。", time: "15:19" },
    ],
    perception: { intent: "送礼选品", emotion: "期待 + 犹豫", intensity: 0.58, skin: "送礼对象 · 暖黄皮待确认", product: "口红 · 稳妥显气色", risk: "green", riskLabel: "增长机会" },
    subtext: { surface: "询问适合妈妈的口红", emotion: "期待 0.58 · 怕失礼 0.51", hidden: "希望礼物显得用心而不是单纯昂贵，并降低选错色号风险", strategy: "用场合、肤色和预算缩小范围，给主推与可替换选项", confidence: 0.88 },
    observed: [60, 64, 69, 72],
    paths: [
      { key: "a", label: "只推热门色", scores: [68, 64, 59], probability: 39, tone: "danger" },
      { key: "b", label: "按预算推荐", scores: [74, 77, 80], probability: 76, tone: "warning" },
      { key: "c", label: "场景化送礼顾问", scores: [78, 86, 92], probability: 93, tone: "success" },
    ],
    recommendationReason: "把“显气色、体面、低选错风险”说清楚，比堆砌热门色更能促成决策。",
    scripts: [
      { label: "场景顾问 · 推荐", text: "您在意的不只是颜色，而是妈妈收到时会觉得体面又好驾驭。预算 400 元左右，我会优先选显气色但不过分张扬的暖调玫瑰色，并准备一个更稳妥的豆沙色作为备选。", score: 91 },
      { label: "快速推荐 · 备选", text: "可以优先考虑暖调玫瑰或豆沙色，日常显气色，也更适合送礼。", score: 78 },
    ],
    product: { name: "YSL 细管纯口红 · 暖调玫瑰", brand: "YSL 圣罗兰", price: "¥395", reason: "匹配 400 元预算、成熟显气色与体面包装三项要求。", ingredients: ["暖调玫瑰", "缎光质地", "礼赠包装"], alternatives: ["稳妥豆沙色", "可更换色号礼卡"], guide: "确认妈妈常用色与肤色后再锁定色号", taboo: "不使用“绝对显白”等极限承诺" },
    empathy: { total: 91, dims: [90, 94, 93, 88, 91], improvement: "追问使用场合后可进一步提升推荐确定性。" },
    riskSignals: [],
    trace: baseTrace.map((item) => ({ ...item, state: "done" })),
    runtime: previewRuntime,
  },
  expectation: {
    scenarioKey: "expectation",
    consumer: { name: "林小姐", vip: "VIP 2", skinType: "干性肌", personality: "失望型", concern: "抗老效果不达预期", allergies: ["香精"], history: "连续使用 14 天 · 首次购买抗老精华" },
    brand: "Kiehl's 科颜氏",
    title: "效果不达预期 · 信任修复",
    messages: [
      { by: "consumer", text: "用了两周一点变化都没有，感觉就是白花钱。", time: "17:06" },
      { by: "consumer", text: "你们宣传得那么好，是不是都只是话术？", time: "17:07" },
    ],
    perception: { intent: "效果不达预期", emotion: "失望 + 怀疑", intensity: 0.74, skin: "干性肌 · 观察周期不足", product: "抗老精华 · 使用 14 天", risk: "yellow", riskLabel: "信任风险" },
    subtext: { surface: "质疑效果与宣传", emotion: "失望 0.74 · 被欺骗感 0.62", hidden: "期待品牌正面回应价值落差，并给可验证而非空泛的下一步", strategy: "承认落差、校准周期、核对用法并提供售后兜底", confidence: 0.91 },
    observed: [66, 58, 50, 43],
    paths: [
      { key: "a", label: "重复产品卖点", scores: [36, 28, 20], probability: 20, tone: "danger" },
      { key: "b", label: "解释使用周期", scores: [49, 55, 60], probability: 58, tone: "warning" },
      { key: "c", label: "承认落差 + 验证计划", scores: [58, 69, 81], probability: 84, tone: "success" },
    ],
    recommendationReason: "消费者需要可验证的预期管理与兜底，而不是再次听产品卖点。",
    scripts: [
      { label: "信任修复 · 推荐", text: "两周认真使用却没有看到期待中的变化，确实会让人怀疑这笔钱是否花得值得。我们不重复宣传话术：我先和您核对用量、频率与搭配，再给一个可观察的时间点；如果仍不符合适用条件，也会说明可走的售后路径。", score: 89 },
      { label: "周期说明 · 备选", text: "理解您的失望。抗老类产品通常需要结合完整使用周期观察，我们可以先核对当前用法并一起设定明确的复盘时间。", score: 75 },
    ],
    product: { name: "现有方案复盘", brand: "科颜氏", price: "不新增购买", reason: "先验证使用方式与适用性，不在消费者失望时追加销售。", ingredients: ["使用频率", "搭配冲突", "观察周期"], alternatives: ["调整使用顺序", "适用性不符时进入售后"], guide: "连续记录 14 天肤感与耐受，约定复盘节点", taboo: "不得保证见效时间或使用“根治、绝对有效”", gated: true },
    empathy: { total: 89, dims: [91, 92, 88, 90, 76], improvement: "品牌契合度可增加科颜氏式成分与用法解释。" },
    riskSignals: ["效果不达预期", "白花钱", "宣传可信度质疑"],
    trace: baseTrace,
    runtime: previewRuntime,
  },
};

export const scenarioInputs: Record<Exclude<LumiScenarioKey, "challenge">, RunInput> = {
  allergy: {
    conversation_id: "demo_001",
    customer_id: "consumer_001",
    text: "用了精华脸全红了怎么办，会不会留疤？算了不说了，反正你们家东西就那样。",
    order_id: "ORDER_2088",
    product_id: "CREAM_B26C0719",
  },
  pregnancy: {
    conversation_id: "demo_002",
    customer_id: "consumer_002",
    text: "我怀孕 5 个月，这款 A 醇精华还能用吗？我只想确认对宝宝是否安全。",
    product_id: "SERUM_HA30",
  },
  acne: {
    conversation_id: "demo_003",
    customer_id: "consumer_003",
    text: "用了七天爆了一脸痘，你们是不是虚假宣传？我真的很失望。",
    product_id: "SERUM_HA30",
  },
  gift: {
    conversation_id: "demo_004",
    customer_id: "consumer_004",
    text: "预算 400 左右，想送妈妈一支口红，怕颜色太年轻也怕显黑。",
  },
  expectation: {
    conversation_id: "demo_005",
    customer_id: "consumer_005",
    text: "抗老精华用了两周一点变化都没有，感觉白花钱，是不是只是宣传话术？",
    product_id: "SERUM_HA30",
  },
};

function scenarioForText(text: string): Exclude<LumiScenarioKey, "challenge"> {
  if (/孕|备孕|哺乳|A\s*醇|视黄醇/.test(text)) return "pregnancy";
  if (/送|妈妈|礼物|口红|色号/.test(text)) return "gift";
  if (/爆痘|痘|闷痘/.test(text)) return "acne";
  if (/没效果|没用|白花钱|宣传|失望/.test(text)) return "expectation";
  return "allergy";
}

export function insightFromRun(
  input: RunInput,
  result?: ApiAnalysis,
): LumiInsight {
  const matchedKey = scenarioForText(input.text);
  const template = scenarios[matchedKey];
  const keepVerticalInterpretation =
    result?.triage.intent === "PRODUCT_INQUIRY" && matchedKey !== "allergy";
  const severity = result?.risk.severity;
  const risk = severity === "CRITICAL" || severity === "HIGH" ? "red" : severity === "MEDIUM" ? "yellow" : template.perception.risk;
  const riskLabel = risk === "red" ? "高风险" : risk === "yellow" ? "需关注" : "常规";
  const now = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  return {
    ...template,
    scenarioKey: "challenge",
    title: "现场开放挑战 · 实时分析",
    messages: [{ by: "consumer", text: input.text, time: now }],
    perception: {
      ...template.perception,
      intent: keepVerticalInterpretation
        ? template.perception.intent
        : result?.triage.intent ?? template.perception.intent,
      risk,
      riskLabel,
    },
    subtext: {
      ...template.subtext,
      surface: keepVerticalInterpretation
        ? template.subtext.surface
        : result?.triage.explicit_request ?? template.subtext.surface,
      hidden: keepVerticalInterpretation
        ? template.subtext.hidden
        : result?.triage.implicit_goal ?? template.subtext.hidden,
    },
    scripts: result && !keepVerticalInterpretation
      ? [
          { label: "Harness 建议 · 推荐", text: result.copilot.draft_reply, score: result.review.approved ? 88 : 62 },
          template.scripts[1],
        ]
      : template.scripts,
    riskSignals: result?.risk.signals.length ? result.risk.signals : template.riskSignals,
    trace: result
      ? result.trace.map((item) => ({
          node: item.graph_node,
          detail: `状态推进至 ${item.state_after}`,
          latency: item.latency_ms,
          state: item.state_after === "REVIEW_FAILED" ? "warn" : "done",
        }))
      : template.trace,
    runtime: result?.runtime ?? template.runtime,
  };
}

export const coldStartStats = [
  { value: "50", label: "消费者画像" },
  { value: "200", label: "历史会话" },
  { value: "30", label: "预警事件" },
  { value: "100", label: "产品 SKU" },
  { value: "500", label: "订单记录" },
  { value: "7", label: "品牌人设" },
];

export const riskAlerts = [
  { id: "AL-1024", level: "red", title: "过敏 · 恐慌 · 60s 未响应", detail: "小美 / demo_001", time: "刚刚", action: "立即接管" },
  { id: "AL-1025", level: "red", title: "孕期禁忌成分命中", detail: "莉莉 / A 醇精华", time: "38s", action: "查看会话" },
  { id: "AL-0998", level: "yellow", title: "坐席语言温度 52 → 38", detail: "坐席 #008 · 连续 11 个高危 case", time: "2m", action: "建议换班" },
  { id: "AL-0984", level: "yellow", title: "负面情绪占比升至 11%", detail: "理肤泉服务组 · 近 15 分钟", time: "4m", action: "趋势分析" },
  { id: "AL-0962", level: "yellow", title: "AI 建议采纳率环比下降 18%", detail: "新手组 · 可能需要模板复盘", time: "8m", action: "派发培训" },
];

export const teamRanking = [
  { name: "王资深", id: "#003", score: 91, trend: "+4", fatigue: "fresh" },
  { name: "赵敏", id: "#007", score: 88, trend: "+2", fatigue: "normal" },
  { name: "周妍", id: "#012", score: 85, trend: "+1", fatigue: "normal" },
  { name: "陈新手", id: "#008", score: 58, trend: "-9", fatigue: "tired" },
  { name: "刘洋", id: "#015", score: 52, trend: "-12", fatigue: "exhausted" },
];

export const riskMetrics = [
  { label: "负面情绪", value: 8, display: "8%", threshold: 15, tone: "green" },
  { label: "升级率", value: 5, display: "5%", threshold: 12, tone: "green" },
  { label: "高危响应", value: 75, display: "75s", threshold: 120, tone: "yellow" },
  { label: "AI 采纳率", value: 72, display: "72%", threshold: 65, tone: "green" },
  { label: "AHT", value: 3.8, display: "3.8m", threshold: 4.8, tone: "green" },
];

export const permissionMatrix = [
  { capability: "接待辅助", viewer: false, agent_junior: true, agent_senior: true, supervisor: true, admin: true },
  { capability: "风险看板", viewer: true, agent_junior: false, agent_senior: false, supervisor: true, admin: true },
  { capability: "转接 / 强制接管", viewer: false, agent_junior: false, agent_senior: true, supervisor: true, admin: true },
  { capability: "派发培训", viewer: false, agent_junior: false, agent_senior: false, supervisor: true, admin: true },
  { capability: "品牌 / 知识配置", viewer: false, agent_junior: false, agent_senior: false, supervisor: false, admin: true },
];
