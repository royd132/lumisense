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

export type ArchaeologyTurn = {
  round: string;
  speaker: "消费者" | "客服";
  quote: string;
  score: number;
  state: "stable" | "friction" | "turning" | "escalation" | "repair";
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
  archaeology: {
    turns: ArchaeologyTurn[];
    turningPoint: {
      round: string;
      from: number;
      to: number;
      trigger: string;
    };
    rootCause: string;
    causalChain: string[];
    avoid: string;
    prescription: string;
    confidence: number;
    evidenceRounds: string[];
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
  { node: "Timeline align", detail: "多轮发言、情绪分与历史事件完成时间对齐", latency: 82, state: "done" },
  { node: "Causal graph", detail: "转折点定位、反事实检验与根因链生成", latency: 186, state: "done" },
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
    archaeology: {
      turns: [
        { round: "R1", speaker: "消费者", quote: "用了精华脸全红了怎么办", score: 68, state: "stable" },
        { round: "R2", speaker: "消费者", quote: "会不会留疤，是不是我用错了", score: 32, state: "turning" },
        { round: "R3", speaker: "客服", quote: "正在核对，请先不要继续使用", score: 35, state: "friction" },
        { round: "R4", speaker: "消费者", quote: "算了不说了，反正就那样", score: 15, state: "escalation" },
      ],
      turningPoint: { round: "R2", from: 68, to: 32, trigger: "安全担忧没有被即时命名，消费者转向自责" },
      rootCause: "真正根因是安全感与被重视感同时断裂，而非产品功效解释不足。",
      causalChain: ["急性泛红", "担心留疤", "客服回应延迟", "自责转失望", "放弃沟通"],
      avoid: "继续解释产品功效，或把症状归因于消费者用法。",
      prescription: "先明确“这不是您的错”，立即给停用动作、升级节点和下一次跟进时间。",
      confidence: 0.89,
      evidenceRounds: ["R1", "R2", "R4"],
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
    archaeology: {
      turns: [
        { round: "R1", speaker: "消费者", quote: "怀孕 5 个月，这款 A 醇还能用吗", score: 62, state: "stable" },
        { round: "R2", speaker: "客服", quote: "可以介绍同系列温和产品", score: 55, state: "friction" },
        { round: "R3", speaker: "消费者", quote: "我不是要你推荐贵的", score: 49, state: "turning" },
        { round: "R4", speaker: "消费者", quote: "只想确认对宝宝安不安全", score: 46, state: "escalation" },
      ],
      turningPoint: { round: "R3", from: 55, to: 49, trigger: "安全咨询被误读为购买意向" },
      rootCause: "信息目标错位：消费者要确定性安全边界，系统却提前进入销售推荐。",
      causalChain: ["孕期不确定", "寻求安全确认", "销售意图误判", "防御上升"],
      avoid: "先推荐替代 SKU，或用“通常没问题”弱化风险。",
      prescription: "先回答禁忌边界与证据来源，再提供非销售性的替代成分清单。",
      confidence: 0.94,
      evidenceRounds: ["R1", "R3", "R4"],
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
    archaeology: {
      turns: [
        { round: "R1", speaker: "消费者", quote: "用了七天爆了一脸痘", score: 58, state: "stable" },
        { round: "R2", speaker: "客服", quote: "可能是正常适应期", score: 48, state: "friction" },
        { round: "R3", speaker: "消费者", quote: "是不是虚假宣传", score: 37, state: "turning" },
        { round: "R4", speaker: "消费者", quote: "真的很失望，白花钱了", score: 29, state: "escalation" },
      ],
      turningPoint: { round: "R3", from: 48, to: 37, trigger: "“正常适应期”回避了真实不良体验" },
      rootCause: "消费者的核心冲突是体验证据被否定，进而形成被欺骗感。",
      causalChain: ["连续使用爆痘", "体验被弱化", "宣传可信度坍塌", "投诉升级"],
      avoid: "解释“排毒期”或重复宣传卖点。",
      prescription: "承认体验事实，停止产品，核验症状与批次，并给出明确售后路径。",
      confidence: 0.91,
      evidenceRounds: ["R1", "R2", "R3", "R4"],
    },
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
    archaeology: {
      turns: [
        { round: "R1", speaker: "消费者", quote: "想送妈妈一支口红", score: 60, state: "stable" },
        { round: "R2", speaker: "消费者", quote: "怕颜色太年轻，也怕显黑", score: 64, state: "friction" },
        { round: "R3", speaker: "客服", quote: "确认预算和包装偏好", score: 69, state: "repair" },
        { round: "R4", speaker: "消费者", quote: "预算 400，包装要体面", score: 72, state: "repair" },
      ],
      turningPoint: { round: "R3", from: 64, to: 69, trigger: "客服从热门色推荐转向送礼场景澄清" },
      rootCause: "购买阻力不是预算，而是担心礼物不合适、显得不用心。",
      causalChain: ["送礼期待", "选错色焦虑", "场景追问", "决策信心回升"],
      avoid: "只按销量推荐热门色号。",
      prescription: "给主推与可替换色，并说明场合、肤色和礼赠包装的匹配依据。",
      confidence: 0.87,
      evidenceRounds: ["R1", "R2", "R4"],
    },
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
    archaeology: {
      turns: [
        { round: "R1", speaker: "消费者", quote: "用了两周一点变化都没有", score: 66, state: "stable" },
        { round: "R2", speaker: "客服", quote: "抗老产品需要坚持使用", score: 58, state: "friction" },
        { round: "R3", speaker: "消费者", quote: "感觉就是白花钱", score: 50, state: "turning" },
        { round: "R4", speaker: "消费者", quote: "宣传是不是都只是话术", score: 43, state: "escalation" },
      ],
      turningPoint: { round: "R3", from: 58, to: 50, trigger: "周期解释缺少可验证目标与售后兜底" },
      rootCause: "信任下降源于价值落差不可验证，不是消费者不了解功效周期。",
      causalChain: ["效果未达预期", "重复周期解释", "价值感下降", "宣传可信度质疑"],
      avoid: "再次重复产品卖点或笼统要求继续坚持。",
      prescription: "承认落差，核对用法，约定可观测指标与复盘时间，并说明售后兜底。",
      confidence: 0.9,
      evidenceRounds: ["R1", "R2", "R3", "R4"],
    },
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
  const matchedKey = input.scenario_key ?? scenarioForText(input.text);
  const template = scenarios[matchedKey];
  const keepVerticalInterpretation =
    result?.triage.intent === "PRODUCT_INQUIRY" && matchedKey !== "allergy";
  const severity = result?.risk.severity;
  const risk = severity === "CRITICAL" || severity === "HIGH" ? "red" : severity === "MEDIUM" ? "yellow" : template.perception.risk;
  const riskLabel = risk === "red" ? "高风险" : risk === "yellow" ? "需关注" : "常规";
  const now = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  const transcript = input.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const transcriptMessages: DemoMessage[] = transcript.map((line, index) => {
    const isAgent = /^(客服|坐席|agent)\s*[:：]/i.test(line);
    const text = line.replace(/^(客户|消费者|客服|坐席|agent)\s*[:：]\s*/i, "");
    return {
      by: isAgent ? "agent" : "consumer",
      text,
      time: `${now.split(":")[0]}:${String((Number(now.split(":")[1]) + index) % 60).padStart(2, "0")}`,
    };
  });
  const hasHistory = transcriptMessages.length >= 3;
  const challengeTurns: ArchaeologyTurn[] = transcriptMessages.map((message, index) => ({
    round: `R${index + 1}`,
    speaker: message.by === "agent" ? "客服" : "消费者",
    quote: message.text,
    score: template.archaeology.turns[Math.min(index, template.archaeology.turns.length - 1)]?.score ?? Math.max(20, 68 - index * 10),
    state: index === 0 ? "stable" : index === transcriptMessages.length - 1 ? "escalation" : index === Math.min(2, transcriptMessages.length - 1) ? "turning" : "friction",
  }));
  return {
    ...template,
    scenarioKey: "challenge",
    title: `${input.concern || template.title} · 自定义运行`,
    consumer: {
      ...template.consumer,
      name: input.consumer_name?.trim() || template.consumer.name,
      skinType: input.skin_type?.trim() || template.consumer.skinType,
      personality: input.personality?.trim() || template.consumer.personality,
      concern: input.concern?.trim() || template.consumer.concern,
    },
    brand: input.brand?.trim() || template.brand,
    messages: transcriptMessages.length ? transcriptMessages : [{ by: "consumer", text: input.text, time: now }],
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
    archaeology: hasHistory
      ? {
          ...template.archaeology,
          turns: challengeTurns,
          turningPoint: {
            ...template.archaeology.turningPoint,
            round: challengeTurns.find((turn) => turn.state === "turning")?.round ?? "R2",
          },
          evidenceRounds: challengeTurns.filter((turn) => turn.speaker === "消费者").map((turn) => turn.round).slice(0, 4),
          confidence: Math.min(template.archaeology.confidence, 0.72 + transcriptMessages.length * 0.03),
        }
      : {
          ...template.archaeology,
          turns: challengeTurns,
          turningPoint: { round: "—", from: 0, to: 0, trigger: "当前只有单轮输入，无法定位真实情绪转折点" },
          rootCause: "证据不足：至少需要 3 轮带角色标记的会话，才能进行时序因果诊断。",
          causalChain: ["单轮输入", "缺少历史事件", "不输出伪因果"],
          prescription: "请补充此前的消费者与客服对话，再生成根因与处方。",
          confidence: 0.38,
          evidenceRounds: challengeTurns.map((turn) => turn.round),
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
  { id: "AL-1024", level: "red", title: "产品安全 · 急性红肿 + 恐慌下坠", detail: "小美 / demo_001 · 证据 R1/R2/R4", time: "刚刚", action: "立即接管" },
  { id: "AL-1025", level: "red", title: "成分禁忌 · 孕期命中 A 醇", detail: "莉莉 / demo_002 · 安全询问未解决", time: "38s", action: "查看会话" },
  { id: "AL-1017", level: "red", title: "投诉升级 · 第 4 次联系且承诺逾期", detail: "林小姐 / demo_005 · 上次承诺已超 26h", time: "1m", action: "主管介入" },
  { id: "AL-0998", level: "yellow", title: "舆情风险 · 提及小红书公开经历", detail: "张女士 / demo_008 · 传播倾向 86%", time: "2m", action: "风险处置" },
  { id: "AL-0984", level: "yellow", title: "信任风险 · 正品质疑 + 高价值订单", detail: "周先生 / demo_011 · 订单 ¥1,680", time: "4m", action: "核验证据" },
];

export const consumerRiskCases = [
  { id: "CR-001", consumer: "小美", level: "red", type: "产品安全", score: 94, signal: "泛红、担心留疤，连续 3 轮情绪下降", evidence: "R1 明确红肿 · R2 自责 · R4 放弃沟通", trajectory: "68 → 32 → 15", contacts: 2, sla: "剩余 00:42", owner: "王资深", action: "立即接管" },
  { id: "CR-005", consumer: "林小姐", level: "red", type: "流失 / 服务失信", score: 88, signal: "同一问题第 4 次联系，上次承诺已逾期", evidence: "历史工单 #392 · 承诺 24h 回复未兑现", trajectory: "61 → 40 → 18", contacts: 4, sla: "已超时 26m", owner: "待分配", action: "主管介入" },
  { id: "CR-008", consumer: "张女士", level: "yellow", type: "舆情升级", score: 86, signal: "明确提及将经历发布到公开平台", evidence: "R6：我要把完整记录发到小红书", trajectory: "54 → 29 → 21", contacts: 3, sla: "剩余 04:18", owner: "赵敏", action: "启动预案" },
  { id: "CR-002", consumer: "莉莉", level: "red", type: "成分安全", score: 91, signal: "孕期使用安全询问，产品证据命中 A 醇", evidence: "消费者孕期 · SKU 成分表包含视黄醇", trajectory: "72 → 55 → 43", contacts: 1, sla: "剩余 01:26", owner: "陈新手", action: "安全复核" },
];

export const riskMetrics = [
  { label: "产品安全", value: 82, max: 100, display: "6 件", threshold: 70, tone: "red" },
  { label: "情绪失控", value: 68, max: 100, display: "12 人", threshold: 60, tone: "yellow" },
  { label: "流失倾向", value: 74, max: 100, display: "9 人", threshold: 65, tone: "red" },
  { label: "投诉舆情", value: 55, max: 100, display: "4 件", threshold: 50, tone: "yellow" },
  { label: "服务失信", value: 63, max: 100, display: "7 件", threshold: 55, tone: "yellow" },
];

export const riskTypeBreakdown = [
  { label: "情绪恶化 / 流失", count: 9, percent: 30, tone: "red" },
  { label: "服务失信 / 重复投诉", count: 7, percent: 23, tone: "amber" },
  { label: "产品与成分安全", count: 6, percent: 20, tone: "purple" },
  { label: "投诉舆情 / 合规", count: 4, percent: 14, tone: "orange" },
  { label: "正品 / 隐私 / 交易信任", count: 4, percent: 13, tone: "green" },
];

export const permissionMatrix = [
  { capability: "接待辅助", viewer: false, agent_junior: true, agent_senior: true, supervisor: true, admin: true },
  { capability: "风险看板", viewer: true, agent_junior: false, agent_senior: false, supervisor: true, admin: true },
  { capability: "转接 / 强制接管", viewer: false, agent_junior: false, agent_senior: true, supervisor: true, admin: true },
  { capability: "派发培训", viewer: false, agent_junior: false, agent_senior: false, supervisor: true, admin: true },
  { capability: "品牌 / 知识配置", viewer: false, agent_junior: false, agent_senior: false, supervisor: false, admin: true },
];
