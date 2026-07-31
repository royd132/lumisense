"use client";

import {
  AlertOutlined,
  ArrowUpOutlined,
  AuditOutlined,
  CheckCircleFilled,
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  EditOutlined,
  ExperimentOutlined,
  HistoryOutlined,
  MessageOutlined,
  MoreOutlined,
  ReloadOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  StarFilled,
  ThunderboltFilled,
  UserOutlined,
  WarningFilled,
} from "@ant-design/icons";
import {
  Avatar,
  Badge,
  Button,
  ConfigProvider,
  Progress,
  Segmented,
  Tag,
  Tooltip,
} from "antd";
import type { EChartsOption } from "echarts";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiDashboard,
  ApiAnalysis,
  CurrentPrincipal,
  EvaluationReport,
  approveCase,
  CAREPULSE_API_ENABLED,
  getCurrentPrincipal,
  getDashboard,
  getEvaluationReport,
  RunInput,
  startRun,
} from "./lib/carepulse-api";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type DemoScenarioKey = "faq" | "refund" | "safety";
type ScenarioKey = DemoScenarioKey | "challenge";
type ViewKey = "workbench" | "dashboard" | "evaluation";

type Evidence = {
  kind: "政策" | "订单" | "历史" | "产品";
  title: string;
  detail: string;
  ref: string;
  tone: "blue" | "gold" | "violet" | "green";
};

type Scenario = {
  short: string;
  label: string;
  badge: string;
  customer: string;
  meta: string;
  intent: string;
  issue: string;
  explicit: string;
  summary: string;
  serviceGoal: string;
  draft: string;
  status: string;
  severity: Severity;
  confidence: number;
  riskSignals: string[];
  messages: { by: "consumer" | "agent"; text: string; time: string }[];
  order?: {
    id: string;
    product: string;
    amount: string;
    state: string;
    extra: string;
  };
  evidence: Evidence[];
  actions: { id?: string; action: string; reason: string; gate: string }[];
  review: {
    approved: boolean;
    label: string;
    detail: string;
  };
  trace: { name: string; detail: string; ms: number; state: "done" | "warn" }[];
  runtime: ApiAnalysis["runtime"];
};

const previewRuntime: ApiAnalysis["runtime"] = {
  harness: "EDGE_D1",
  model_mode: "STRUCTURED_FALLBACK",
  model: "正在验证",
  fallback_reason: "awaiting_runtime",
  model_latency_ms: 0,
  input_tokens: 0,
  output_tokens: 0,
};

const demoScenarioKeys: DemoScenarioKey[] = ["faq", "refund", "safety"];

const scenarios: Record<DemoScenarioKey, Scenario> = {
  faq: {
    short: "A",
    label: "普通 FAQ",
    badge: "短链路",
    customer: "林女士",
    meta: "普通会员 · Web 在线咨询",
    intent: "PRODUCT_INQUIRY",
    issue: "INGREDIENT_USAGE",
    explicit: "确认敏感肌是否适用",
    summary: "消费者想确认玻尿酸复颜精华是否适合敏感肌，以及首次使用时的注意事项。",
    serviceGoal: "基于已批准的产品说明给出清晰用法，不对医学效果作出承诺。",
    draft:
      "林女士您好，这款复颜玻尿酸精华的产品说明中标注可用于日常补水。若您属于敏感肌，建议首次使用前先在耳后或手臂内侧做局部测试，确认无不适后再逐步使用。由于每个人的皮肤状态不同，如目前正处于泛红、破损或治疗期，建议先咨询专业医生。",
    status: "PENDING_AGENT_APPROVAL",
    severity: "LOW",
    confidence: 0.96,
    riskSignals: [],
    messages: [
      { by: "consumer", text: "你好，想问下你们这款玻尿酸精华敏感肌能用吗？", time: "10:24" },
      { by: "agent", text: "您好，我来帮您核对一下产品说明。", time: "10:24" },
      { by: "consumer", text: "我之前用一些精华会有点泛红，第一次怎么用比较好？", time: "10:25" },
    ],
    order: {
      id: "未关联订单",
      product: "复颜玻尿酸精华 30ml",
      amount: "¥319",
      state: "产品咨询",
      extra: "护肤 · 精华",
    },
    evidence: [
      {
        kind: "产品",
        title: "敏感肌首次使用建议",
        detail: "首次使用前建议局部测试；出现持续不适时应停止使用并咨询专业人士。",
        ref: "product:revitalift_ha:v4:usage_2",
        tone: "green",
      },
      {
        kind: "政策",
        title: "功效沟通合规指引",
        detail: "客服不得使用“治疗”“修复疾病”等医学效果表述。",
        ref: "policy:claim_safety:v3:clause_1_4",
        tone: "blue",
      },
    ],
    actions: [
      {
        action: "发送产品使用指引",
        reason: "问题可由当前已批准的产品说明完整回答",
        gate: "人工确认",
      },
    ],
    review: {
      approved: true,
      label: "审查通过",
      detail: "事实均有依据，未包含医学承诺，已回应消费者的明确问题。",
    },
    trace: [
      { name: "Triage Agent", detail: "识别产品咨询与敏感肌使用问题", ms: 186, state: "done" },
      { name: "Risk Engine", detail: "未发现服务升级硬信号", ms: 9, state: "done" },
      { name: "Evidence Service", detail: "召回 2 条已批准产品与政策证据", ms: 148, state: "done" },
      { name: "Copilot Agent", detail: "生成带引用的建议回复", ms: 612, state: "done" },
      { name: "Review Agent", detail: "合规与事实审查通过", ms: 274, state: "done" },
    ],
    runtime: previewRuntime,
  },
  refund: {
    short: "B",
    label: "重复退款投诉",
    badge: "完整链路",
    customer: "周女士",
    meta: "金卡会员 · 第 3 次联系",
    intent: "REFUND_COMPLAINT",
    issue: "PRODUCT_DAMAGE",
    explicit: "尽快完成退款",
    summary: "消费者收到外包装破损的粉底液并第三次追问退款；上一位客服承诺 24 小时内反馈，目前已经超时。",
    serviceGoal: "承认处理延迟，核对退款资格与历史承诺，避免再次要求消费者提供已有信息。",
    draft:
      "周女士您好，很抱歉让您为同一问题多次联系我们。我们已核对到订单已签收 2 天，您此前提交的破损照片也已记录，无需再次提供。上一轮承诺的 24 小时反馈已超时，我会为您优先提交退款资格复核，并由专员跟进处理进度。退款仍需完成系统核验，我们暂不对到账时间作不确定承诺。",
    status: "PENDING_AGENT_APPROVAL",
    severity: "HIGH",
    confidence: 0.94,
    riskSignals: ["同一问题已联系 3 次", "上一轮退款反馈承诺已超时", "消费者明确要求尽快完成退款"],
    messages: [
      { by: "consumer", text: "这已经是我第三次来问了，破损照片前天就发过。", time: "14:08" },
      { by: "agent", text: "抱歉让您久等，我正在查看前序记录。", time: "14:09" },
      { by: "consumer", text: "昨天说 24 小时内处理退款，现在还是没有任何消息。", time: "14:10" },
      { by: "consumer", text: "请不要再让我重复提交材料了。", time: "14:10" },
    ],
    order: {
      id: "ORDER_1024",
      product: "持妆粉底液 P120",
      amount: "¥389",
      state: "已签收 · 2 天",
      extra: "退款状态：待申请",
    },
    evidence: [
      {
        kind: "订单",
        title: "ORDER_1024",
        detail: "2026-07-28 11:30 签收；实付 ¥389；退款状态 NOT_REQUESTED。",
        ref: "order:ORDER_1024",
        tone: "blue",
      },
      {
        kind: "政策",
        title: "破损商品售后政策 §3.2",
        detail: "签收 7 日内且已有有效破损凭证，可发起退款资格核验。",
        ref: "policy:refund_v5:clause_3_2",
        tone: "gold",
      },
      {
        kind: "历史",
        title: "历史承诺 #PROMISE_221",
        detail: "客服于昨日 13:46 承诺 24 小时内反馈，当前已超时 24 分钟。",
        ref: "promise:PROMISE_221",
        tone: "violet",
      },
    ],
    actions: [
      {
        action: "优先核验退款资格",
        reason: "已具备订单与破损凭证，且历史服务承诺已超时",
        gate: "人工批准后进入 Outbox",
      },
      {
        action: "创建主管回访任务",
        reason: "重复联系达到 3 次，需避免消费者继续流转",
        gate: "主管审批",
      },
    ],
    review: {
      approved: true,
      label: "审查通过",
      detail: "未擅自承诺退款结果或到账时间；订单、凭证与承诺均有证据引用。",
    },
    trace: [
      { name: "Triage Agent", detail: "识别退款投诉、破损商品与明确诉求", ms: 204, state: "done" },
      { name: "Risk Engine", detail: "命中重复联系与承诺超时规则", ms: 11, state: "warn" },
      { name: "Evidence Service", detail: "并行获取订单、历史承诺与退款政策", ms: 173, state: "done" },
      { name: "Copilot Agent", detail: "生成建议回复与 2 项处置动作", ms: 684, state: "done" },
      { name: "Validators", detail: "金额、时间、引用、权限校验通过", ms: 18, state: "done" },
      { name: "Review Agent", detail: "事实与政策审查通过", ms: 291, state: "done" },
    ],
    runtime: previewRuntime,
  },
  safety: {
    short: "C",
    label: "不良反应与舆情",
    badge: "高风险链路",
    customer: "陈女士",
    meta: "银卡会员 · App 客服",
    intent: "PRODUCT_SAFETY_COMPLAINT",
    issue: "ADVERSE_REACTION",
    explicit: "解释原因并立即处理",
    summary: "消费者称使用面霜后出现面部红肿，并表示若得不到处理将发布至社交平台。",
    serviceGoal: "优先保障消费者安全，停止普通补偿话术，立即转入人工高风险处置流程。",
    draft:
      "陈女士您好，很抱歉得知您出现了面部红肿。请先暂停使用该产品；如症状明显、持续或加重，请及时寻求专业医疗帮助。为了由专人尽快跟进，我会在您确认后立即将情况升级至产品安全团队。我们将核对产品批次与使用情况，但在完成专业评估前不会对原因作推断。",
    status: "PENDING_AGENT_APPROVAL",
    severity: "CRITICAL",
    confidence: 0.98,
    riskSignals: ["明确描述面部红肿", "消费者表示将发布至社交平台", "要求立即处理"],
    messages: [
      { by: "consumer", text: "昨晚用了你们的面霜，今天脸上红肿得很明显。", time: "16:41" },
      { by: "agent", text: "非常抱歉给您带来这样的体验，我马上协助核实。", time: "16:42" },
      { by: "consumer", text: "如果今天还不给我处理，我会把照片发到社交平台。", time: "16:43" },
      { by: "consumer", text: "你们必须马上给我一个解释。", time: "16:43" },
    ],
    order: {
      id: "ORDER_2088",
      product: "玻色因紧致面霜 50ml",
      amount: "¥499",
      state: "已签收 · 5 天",
      extra: "批次：B26C0719",
    },
    evidence: [
      {
        kind: "产品",
        title: "产品安全处置 SOP §2.1",
        detail: "出现明确红肿等不良反应描述时，应建议暂停使用并进入安全事件收集流程。",
        ref: "policy:safety_sop_v6:clause_2_1",
        tone: "green",
      },
      {
        kind: "政策",
        title: "高风险服务升级规则 §1.3",
        detail: "不良反应与公开传播意图同时出现时，风险取最高等级并强制人工升级。",
        ref: "policy:risk_escalation_v4:clause_1_3",
        tone: "gold",
      },
      {
        kind: "订单",
        title: "ORDER_2088 / 批次 B26C0719",
        detail: "产品由品牌旗舰店发出，需由产品安全团队进一步核对批次记录。",
        ref: "order:ORDER_2088",
        tone: "blue",
      },
    ],
    actions: [
      {
        action: "升级产品安全事件",
        reason: "命中明确不良反应硬规则",
        gate: "人工批准后创建风险工单",
      },
      {
        action: "通知值班主管",
        reason: "存在公开平台传播倾向",
        gate: "Outbox 幂等执行",
      },
    ],
    review: {
      approved: true,
      label: "高风险审查通过",
      detail: "已避免原因归因与赔偿承诺；安全建议、升级路径和不确定性表达完整。",
    },
    trace: [
      { name: "Triage Agent", detail: "识别产品安全投诉与立即处理诉求", ms: 217, state: "done" },
      { name: "Risk Engine", detail: "命中不良反应与舆情威胁两项硬规则", ms: 8, state: "warn" },
      { name: "Deterministic Router", detail: "强制进入高风险路径", ms: 3, state: "warn" },
      { name: "Evidence Service", detail: "强制加载安全 SOP、升级规则与批次信息", ms: 189, state: "done" },
      { name: "Copilot Agent", detail: "生成安全优先的建议回复", ms: 731, state: "done" },
      { name: "Review Agent", detail: "高风险独立审查通过", ms: 326, state: "done" },
    ],
    runtime: previewRuntime,
  },
};

const processingSteps = [
  "正在理解消费者诉求",
  "正在检查风险信号",
  "正在并行获取业务证据",
  "正在生成建议回复",
  "正在执行独立审查",
];

const runInputs: Record<DemoScenarioKey, RunInput> = {
  faq: {
    conversation_id: "conv_faq_001",
    customer_id: "customer_lin",
    text: "你好，想问玻尿酸精华敏感肌能用吗？第一次怎么用比较好？",
  },
  refund: {
    conversation_id: "conv_refund_1024",
    customer_id: "customer_zhou",
    text: "这已经是第三次联系，破损照片发过了，退款承诺还是没有处理。",
    order_id: "ORDER_1024",
    contact_count: 3,
    previous_promise_overdue: true,
  },
  safety: {
    conversation_id: "conv_safety_2088",
    customer_id: "customer_chen",
    text: "用了面霜后脸上红肿，今天不处理我就发到小红书曝光。",
    order_id: "ORDER_2088",
  },
};

function challengeScenario(input: RunInput): Scenario {
  const order =
    input.order_id === "ORDER_1024"
      ? {
          id: "ORDER_1024",
          product: "持妆粉底液 P120",
          amount: "¥389",
          state: "待在线核验",
          extra: "开放输入关联订单",
        }
      : input.order_id === "ORDER_2088"
        ? {
            id: "ORDER_2088",
            product: "玻色因紧致面霜 50ml",
            amount: "¥499",
            state: "待在线核验",
            extra: "批次：B26C0719",
          }
        : undefined;
  return {
    short: "✦",
    label: "评委开放输入",
    badge: "现场运行",
    customer: "现场消费者",
    meta: "随机挑战 · 服务原文仅在当前授权范围展示",
    intent: "ANALYZING",
    issue: "ANALYZING",
    explicit: "等待结构化理解",
    summary: "Harness 正在对现场输入执行脱敏、风险识别、证据检索与独立审查。",
    serviceGoal: "生成可回溯、不可自动发送的人工客服建议。",
    draft: "正在生成基于证据的建议回复……",
    status: "PROCESSING",
    severity: "MEDIUM",
    confidence: 0,
    riskSignals: [],
    messages: [
      {
        by: "consumer",
        text: input.text,
        time: new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ],
    order,
    evidence: [],
    actions: [],
    review: {
      approved: false,
      label: "等待独立审查",
      detail: "建议回复在 Review Agent 和确定性校验通过前不可审批。",
    },
    trace: [],
    runtime: previewRuntime,
  };
}

function scenarioFromApi(base: Scenario, result: ApiAnalysis): Scenario {
  const evidenceTone = (type: string): Evidence["tone"] =>
    type === "ORDER" ? "blue" : type.includes("POLICY") || type.includes("SOP") ? "gold" : type === "PRODUCT" ? "green" : "violet";
  const evidenceKind = (type: string): Evidence["kind"] =>
    type === "ORDER" ? "订单" : type === "PRODUCT" ? "产品" : type.includes("HISTORY") || type === "PROMISE" ? "历史" : "政策";

  return {
    ...base,
    runtime: result.runtime,
    intent: result.triage.intent,
    issue: result.triage.issue_type,
    explicit: result.triage.explicit_request,
    summary: result.copilot.consumer_summary,
    serviceGoal: result.copilot.service_goal,
    draft: result.copilot.draft_reply,
    status: result.state,
    severity: result.risk.severity === "REVIEW_REQUIRED" ? "HIGH" : result.risk.severity,
    confidence: Math.min(result.triage.confidence, result.risk.confidence),
    riskSignals: result.risk.signals,
    evidence: result.evidence.items.map((item) => ({
      kind: evidenceKind(item.evidence_type),
      title: item.title,
      detail: item.content,
      ref: item.evidence_id,
      tone: evidenceTone(item.evidence_type),
    })),
    actions: result.copilot.recommended_actions.map((item) => ({
      id: item.action,
      action: item.action,
      reason: item.reason,
      gate: "人工批准后进入 Outbox",
    })),
    review: {
      approved: result.review.approved,
      label: result.review.approved ? "独立审查通过" : "需要人工复核",
      detail: result.review.approved
        ? "必需证据、引用、风险措辞与动作权限均已独立复核。"
        : result.review.violations.map((item) => item.message).join("；"),
    },
    trace: result.trace.map((item) => ({
      name: item.graph_node,
      detail: `状态推进至 ${item.state_after}`,
      ms: item.latency_ms,
      state: item.state_after === "REVIEW_FAILED" ? "warn" : "done",
    })),
  };
}

const severityMeta: Record<
  Severity,
  { label: string; className: string; color: string; hint: string }
> = {
  LOW: { label: "低风险", className: "risk-low", color: "#13a671", hint: "常规人工确认" },
  MEDIUM: { label: "中风险", className: "risk-medium", color: "#d99a18", hint: "建议重点复核" },
  HIGH: { label: "高风险", className: "risk-high", color: "#ef6a4c", hint: "需要主管关注" },
  CRITICAL: { label: "严重风险", className: "risk-critical", color: "#d9364f", hint: "强制人工升级" },
};

function EChart({ option, className = "" }: { option: EChartsOption; className?: string }) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let chart: import("echarts").ECharts | undefined;
    let disposed = false;

    void import("echarts").then((echarts) => {
      if (disposed || !chartRef.current) return;
      chart = echarts.init(chartRef.current);
      chart.setOption(option);
      const resize = () => chart?.resize();
      window.addEventListener("resize", resize);
      chart.on("finished", resize);
    });

    return () => {
      disposed = true;
      chart?.dispose();
    };
  }, [option]);

  return <div ref={chartRef} className={`echart ${className}`} role="img" aria-label="数据趋势图" />;
}

function ProductMark() {
  return (
    <div className="product-mark" aria-hidden="true">
      <span className="pulse-ring ring-one" />
      <span className="pulse-ring ring-two" />
      <span className="pulse-core">
        <ThunderboltFilled />
      </span>
    </div>
  );
}

function Workbench({
  scenarioKey,
  onScenario,
  principal,
  customInput,
  onCustomRun,
}: {
  scenarioKey: ScenarioKey;
  onScenario: (key: ScenarioKey) => void;
  principal: CurrentPrincipal | null;
  customInput: RunInput | null;
  onCustomRun: (input: RunInput) => void;
}) {
  const baseScenario = useMemo(
    () =>
      scenarioKey === "challenge" && customInput
        ? challengeScenario(customInput)
        : scenarios[scenarioKey as DemoScenarioKey],
    [customInput, scenarioKey],
  );
  const runInput =
    scenarioKey === "challenge"
      ? customInput
      : runInputs[scenarioKey as DemoScenarioKey];
  const [scenario, setScenario] = useState(baseScenario);
  const [draft, setDraft] = useState(baseScenario.draft);
  const [processingIndex, setProcessingIndex] = useState(
    CAREPULSE_API_ENABLED ? 0 : -1,
  );
  const [notice, setNotice] = useState("");
  const [runtimeMode, setRuntimeMode] = useState<
    "connecting" | "online" | "demo" | "error"
  >(
    CAREPULSE_API_ENABLED ? "connecting" : "demo",
  );
  const [liveCaseId, setLiveCaseId] = useState<string | null>(null);
  const [selectedActionIds, setSelectedActionIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const [challengeText, setChallengeText] = useState(customInput?.text ?? "");
  const [challengeOrder, setChallengeOrder] = useState(
    customInput?.order_id ?? "",
  );
  const [challengeRepeat, setChallengeRepeat] = useState(
    (customInput?.contact_count ?? 1) >= 3,
  );
  const [challengeOverdue, setChallengeOverdue] = useState(
    customInput?.previous_promise_overdue ?? false,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!CAREPULSE_API_ENABLED || !runInput) return;
    let active = true;
    void startRun(runInput, (node) => {
      if (!active) return;
      const order = ["ingest", "triage_and_risk", "evidence", "draft", "review"];
      setProcessingIndex(Math.max(0, order.indexOf(node)));
    })
      .then((result) => {
        if (!active) return;
        const hydrated = scenarioFromApi(baseScenario, result);
        setScenario(hydrated);
        setDraft(hydrated.draft);
        setLiveCaseId(result.case_id);
        setSelectedActionIds([]);
        setFinalized(
          ["APPROVED", "ESCALATED", "PENDING_SUPERVISOR_APPROVAL"].includes(
            result.state,
          ) ||
            (result.state === "REVIEW_FAILED" && result.review.approved),
        );
        setRuntimeMode("online");
        setProcessingIndex(-1);
      })
      .catch(() => {
        if (!active) return;
        setRuntimeMode("error");
        setProcessingIndex(-1);
        setNotice("后端 Harness 暂不可用，当前保留演示数据且不会执行任何副作用。");
      });
    return () => {
      active = false;
    };
  }, [baseScenario, runInput]);

  const switchScenario = (key: DemoScenarioKey) => {
    if (key === scenarioKey) return;
    if (CAREPULSE_API_ENABLED) {
      onScenario(key);
      return;
    }
    setProcessingIndex(0);
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      if (index >= processingSteps.length) {
        window.clearInterval(timer);
        setProcessingIndex(-1);
        onScenario(key);
      } else {
        setProcessingIndex(index);
      }
    }, 260);
  };

  const submitChallenge = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = challengeText.trim();
    if (text.length < 6) {
      setNotice("请至少输入 6 个字的真实客服问题，便于完成风险与证据判断。");
      return;
    }
    const selectedProduct =
      challengeOrder === "ORDER_1024"
        ? "FOUNDATION_P120"
        : challengeOrder === "ORDER_2088"
          ? "CREAM_B26C0719"
          : /玻尿酸|精华/.test(text)
            ? "SERUM_HA30"
            : undefined;
    onCustomRun({
      conversation_id: `judge_${Date.now()}`,
      customer_id: "judge_live_consumer",
      text,
      ...(challengeOrder ? { order_id: challengeOrder } : {}),
      ...(selectedProduct ? { product_id: selectedProduct } : {}),
      contact_count: challengeRepeat ? 3 : 1,
      previous_promise_overdue: challengeOverdue,
    });
  };

  const approve = async () => {
    if (submitting || finalized) return;
    if (liveCaseId) {
      setSubmitting(true);
      try {
        const changed = draft !== scenario.draft;
        const decision = changed ? "EDIT" : "ACCEPT";
        const result = await approveCase(
          liveCaseId,
          decision,
          draft,
          selectedActionIds,
        );
        setScenario((current) => ({ ...current, status: result.state }));
        setFinalized(true);
        setNotice(
          `审批已落库，状态 ${result.state}；${result.outbox_event_ids.length} 项动作已进入可重试 Outbox。`,
        );
      } catch {
        setNotice("审批未通过权限或状态校验，未写入任何副作用。");
      } finally {
        setSubmitting(false);
      }
      return;
    }
    const critical = scenario.severity === "CRITICAL";
    setNotice(
      critical
        ? "已批准升级计划：风险工单与主管通知已安全写入 Outbox。"
        : "建议回复已批准，案例状态更新为 APPROVED；等待人工发送。",
    );
  };

  const escalate = async () => {
    if (submitting || finalized) return;
    const supervisor = ["SUPERVISOR", "RISK_MANAGER", "ADMIN"].includes(
      principal?.role ?? "AGENT",
    );
    if (!liveCaseId) {
      setFinalized(true);
      setNotice(
        supervisor
          ? "演示升级已确认；接入 API 后将以同一审批门写入 Outbox。"
          : "演示主管复核请求已确认；接入 API 后将进入主管审批队列。",
      );
      return;
    }
    if (
      supervisor &&
      scenario.severity === "CRITICAL" &&
      !selectedActionIds.includes("ESCALATE_PRODUCT_SAFETY")
    ) {
      setNotice("严重风险升级前，必须明确勾选产品安全升级动作。");
      return;
    }
    setSubmitting(true);
    try {
      const result = await approveCase(
        liveCaseId,
        supervisor ? "ESCALATE" : "REQUEST_ESCALATION",
        draft,
        supervisor ? selectedActionIds : [],
      );
      setScenario((current) => ({ ...current, status: result.state }));
      setFinalized(true);
      setNotice(
        supervisor
          ? `主管升级已落库，${result.outbox_event_ids.length} 项动作进入可重试 Outbox。`
          : "已创建主管复核请求，案例进入 PENDING_SUPERVISOR_APPROVAL；当前建议不会自动发送。",
      );
    } catch {
      setNotice("升级请求未通过权限或状态校验，未创建任何副作用。");
    } finally {
      setSubmitting(false);
    }
  };

  const reject = async () => {
    if (submitting || finalized) return;
    if (liveCaseId) {
      setSubmitting(true);
      try {
        const result = await approveCase(liveCaseId, "REJECT", draft, []);
        setScenario((current) => ({ ...current, status: result.state }));
        setFinalized(true);
        setNotice("已拒绝本次建议，审批记录已保存，未创建副作用。");
      } catch {
        setNotice("拒绝操作未完成，请刷新运行状态后重试。");
      } finally {
        setSubmitting(false);
      }
      return;
    }
    setNotice("已拒绝本次建议，拒绝原因与当前草稿已写入审批记录。");
  };

  const severity = severityMeta[scenario.severity];
  const totalMs = scenario.trace.reduce((sum, item) => sum + item.ms, 0);
  const runtimePending = scenario.runtime.model === "正在验证";
  const liveModel = scenario.runtime.model_mode === "LIVE_MODEL";
  const fallbackLabel: Record<string, string> = {
    awaiting_runtime: "正在核验模型运行状态",
    api_key_not_configured: "模型密钥未配置，使用可重复结构化回退",
    model_timeout: "模型超时，已安全切换结构化回退",
    model_unavailable: "模型暂不可用，已安全切换结构化回退",
  };

  return (
    <main className="workbench-shell">
      <form className="judge-console" onSubmit={submitChallenge}>
        <div className="judge-console-title">
          <span className="judge-icon">
            <ExperimentOutlined />
          </span>
          <div>
            <span className="eyebrow">JUDGE CHALLENGE</span>
            <strong>粘贴任意美妆客服问题，现场验证非脚本化链路</strong>
          </div>
        </div>
        <textarea
          value={challengeText}
          onChange={(event) => setChallengeText(event.target.value)}
          maxLength={1200}
          placeholder="例如：昨晚用了面霜后脸上发痒，之前联系两次都没处理，我准备去投诉……"
          aria-label="评委开放投诉输入"
        />
        <div className="judge-controls">
          <select
            value={challengeOrder}
            onChange={(event) => setChallengeOrder(event.target.value)}
            aria-label="关联演示订单"
          >
            <option value="">不关联订单</option>
            <option value="ORDER_1024">ORDER_1024 · 粉底液</option>
            <option value="ORDER_2088">ORDER_2088 · 面霜</option>
          </select>
          <label>
            <input
              type="checkbox"
              checked={challengeRepeat}
              onChange={(event) => setChallengeRepeat(event.target.checked)}
            />
            已重复联系
          </label>
          <label>
            <input
              type="checkbox"
              checked={challengeOverdue}
              onChange={(event) => setChallengeOverdue(event.target.checked)}
            />
            历史承诺超时
          </label>
        </div>
        <Button
          type="primary"
          htmlType="submit"
          icon={<ExperimentOutlined />}
          loading={scenarioKey === "challenge" && processingIndex >= 0}
          disabled={!challengeText.trim()}
        >
          现场分析
        </Button>
        <small>输入先脱敏；建议不自动发送；副作用仍需人工审批</small>
      </form>

      <section className="scenario-strip" aria-label="演示场景">
        <div className="scenario-intro">
          <span className="eyebrow">DEMO PATHS</span>
          <strong>三条可验证业务链路</strong>
        </div>
        <div className="scenario-options">
          {demoScenarioKeys.map((key) => {
            const item = scenarios[key];
            return (
              <button
                className={`scenario-option ${key === scenarioKey ? "is-active" : ""}`}
                key={key}
                onClick={() => switchScenario(key)}
                data-testid={`scenario-${key}`}
              >
                <span className="scenario-letter">{item.short}</span>
                <span>
                  <b>{item.label}</b>
                  <small>{item.badge}</small>
                </span>
              </button>
            );
          })}
        </div>
        <div className={`live-state ${runtimeMode !== "online" ? "is-demo" : ""}`}>
          <span className="live-dot" />
          {runtimeMode === "online"
            ? "Harness 在线"
            : runtimeMode === "connecting"
              ? "正在连接 Harness"
              : runtimeMode === "error"
                ? "演示回退"
                : "演示模式"}
          <small>
            {runtimeMode === "online"
              ? "REST + SSE · 持久化运行时"
              : runtimeMode === "connecting"
                ? "正在验证运行时"
                : "无后端副作用"}
          </small>
        </div>
      </section>

      <section
        className={`model-proof ${liveModel ? "is-live" : "is-fallback"} ${runtimePending ? "is-pending" : ""}`}
        aria-label="模型运行证明"
      >
        <div>
          <span className="model-proof-dot" />
          <strong>
            {runtimePending
              ? "VERIFYING MODEL"
              : liveModel
                ? "LIVE MODEL"
                : "SAFE FALLBACK"}
          </strong>
        </div>
        <span className="model-name">{scenario.runtime.model}</span>
        <p>
          {runtimePending
            ? "正在读取本轮 Trace"
            : liveModel
              ? `Triage / Copilot / Review 三次结构化调用 · ${scenario.runtime.model_latency_ms}ms · ${scenario.runtime.input_tokens + scenario.runtime.output_tokens} tokens`
              : fallbackLabel[scenario.runtime.fallback_reason ?? ""] ??
                "确定性 Harness 回退已启用"}
        </p>
        <code>
          {liveModel ? "fallback_used=false" : "fallback_used=true"} · JSON
          Schema · validators
        </code>
      </section>

      {processingIndex >= 0 && (
        <div className="processing-bar" role="status" aria-live="polite">
          <div className="processing-orb">
            <StarFilled />
          </div>
          <div className="processing-copy">
            <b>{processingSteps[processingIndex]}</b>
            <span>
              {processingIndex + 1} / {processingSteps.length} · 受控状态图执行中
            </span>
          </div>
          <Progress
            percent={((processingIndex + 1) / processingSteps.length) * 100}
            showInfo={false}
            strokeColor="#2563eb"
            trailColor="#e8edf5"
          />
        </div>
      )}

      {notice && (
        <div className="approval-notice" role="status">
          <CheckCircleFilled />
          <span>{notice}</span>
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            <CloseOutlined />
          </button>
        </div>
      )}

      <section className="workbench-grid">
        <aside className="panel conversation-panel">
          <div className="panel-head conversation-head">
            <div className="customer-identity">
              <Badge dot color={severity.color} offset={[-2, 40]}>
                <Avatar size={44} className="customer-avatar">
                  {scenario.customer.slice(0, 1)}
                </Avatar>
              </Badge>
              <div>
                <div className="identity-row">
                  <h2>{scenario.customer}</h2>
                  {scenarioKey === "refund" && <Tag color="gold">金卡</Tag>}
                </div>
                <p>{scenario.meta}</p>
              </div>
            </div>
            <Button type="text" icon={<MoreOutlined />} aria-label="更多会话操作" />
          </div>

          <div className="case-ribbon">
            <div>
              <span>案例状态</span>
              <b>{scenario.status.replaceAll("_", " ")}</b>
            </div>
            <span className="state-dot" />
          </div>

          <div className="conversation-scroll">
            <div className="timeline-date">今天</div>
            {scenario.messages.map((message, index) => (
              <div className={`message-row ${message.by}`} key={`${message.time}-${index}`}>
                {message.by === "agent" && (
                  <Avatar size={26} icon={<UserOutlined />} className="agent-avatar" />
                )}
                <div>
                  <div className="message-bubble">{message.text}</div>
                  <span className="message-time">{message.time}</span>
                </div>
              </div>
            ))}
            <div className="conversation-marker">
              <StarFilled />
              Copilot 已接手分析
            </div>
          </div>

          {scenario.order && (
            <div className="order-card">
              <div className="order-thumb">
                <span />
              </div>
              <div className="order-copy">
                <div>
                  <b>{scenario.order.product}</b>
                  <span>{scenario.order.id}</span>
                </div>
                <div className="order-meta">
                  <strong>{scenario.order.amount}</strong>
                  <span>{scenario.order.state}</span>
                </div>
                <small>{scenario.order.extra}</small>
              </div>
            </div>
          )}
        </aside>

        <section className="center-stack">
          <article className="panel understanding-card">
            <div className="card-label-row">
              <div className="icon-label blue">
                <RobotOutlined />
                <span>Triage Agent</span>
              </div>
              <div className="confidence">
                <span>置信度</span>
                <b>{Math.round(scenario.confidence * 100)}%</b>
              </div>
            </div>
            <h1>消费者问题理解</h1>
            <p className="summary-text">{scenario.summary}</p>
            <div className="triage-grid">
              <div>
                <span>服务意图</span>
                <b>{scenario.intent}</b>
              </div>
              <div>
                <span>问题类型</span>
                <b>{scenario.issue}</b>
              </div>
              <div>
                <span>明确诉求</span>
                <b>{scenario.explicit}</b>
              </div>
            </div>
            <div className="service-goal">
              <span className="goal-line" />
              <div>
                <span>本轮服务目标</span>
                <p>{scenario.serviceGoal}</p>
              </div>
            </div>
          </article>

          <article className="panel copilot-card">
            <div className="copilot-head">
              <div>
                <div className="icon-label indigo">
                  <StarFilled />
                  <span>Copilot 建议</span>
                </div>
                <h2>建议回复</h2>
              </div>
              <div className="grounded-badge">
                <SafetyCertificateOutlined />
                已基于 {scenario.evidence.length} 条证据
              </div>
            </div>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={finalized}
              aria-label="Copilot 建议回复"
              data-testid="draft-reply"
            />
            <div className="draft-meta">
              <span>{draft.length} 字</span>
              <span>已脱敏</span>
              <span>无自动发送权限</span>
            </div>

            <div className="suggested-actions">
              <div className="section-title">
                <span>建议动作</span>
                <small>所有副作用均需审批</small>
              </div>
              {scenario.actions.map((item, index) => (
                <div className="action-row" key={item.action}>
                  <input
                    type="checkbox"
                    aria-label={`批准动作 ${item.action}`}
                    checked={selectedActionIds.includes(item.id ?? item.action)}
                    disabled={finalized || submitting}
                    onChange={(event) => {
                      const id = item.id ?? item.action;
                      setSelectedActionIds((current) =>
                        event.target.checked
                          ? [...current, id]
                          : current.filter((value) => value !== id),
                      );
                    }}
                  />
                  <span className="action-index">0{index + 1}</span>
                  <div>
                    <b>{item.action}</b>
                    <p>{item.reason}</p>
                  </div>
                  <Tag>{item.gate}</Tag>
                </div>
              ))}
            </div>

            <div className="approval-actions">
              <div className="approval-copy">
                <span>最终决策权</span>
                <b>人工客服</b>
              </div>
              <div className="button-group">
                <Tooltip title="编辑当前建议">
                  <Button
                    icon={<EditOutlined />}
                    onClick={() => textareaRef.current?.focus()}
                    aria-label="编辑建议回复"
                    disabled={finalized || submitting}
                  />
                </Tooltip>
                <Button
                  danger
                  icon={<CloseOutlined />}
                  onClick={reject}
                  disabled={finalized}
                  loading={submitting}
                >
                  拒绝
                </Button>
                <Button
                  icon={<ArrowUpOutlined />}
                  onClick={escalate}
                  disabled={
                    finalized ||
                    submitting ||
                    (scenario.severity === "LOW" && scenario.review.approved)
                  }
                >
                  {["SUPERVISOR", "RISK_MANAGER", "ADMIN"].includes(
                    principal?.role ?? "AGENT",
                  )
                    ? "主管升级"
                    : "请求主管升级"}
                </Button>
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={approve}
                  data-testid="approve-action"
                  disabled={
                    finalized ||
                    !scenario.review.approved ||
                    scenario.severity === "CRITICAL"
                  }
                  loading={submitting}
                >
                  {finalized ? "已完成审批" : "接受建议"}
                </Button>
              </div>
            </div>
          </article>
        </section>

        <aside className="right-stack">
          <article className={`panel risk-card ${severity.className}`}>
            <div className="risk-top">
              <div>
                <div className="icon-label risk">
                  {scenario.severity === "LOW" ? <SafetyCertificateOutlined /> : <WarningFilled />}
                  <span>Risk Signal Engine</span>
                </div>
                <div className="risk-score-row">
                  <h2>{severity.label}</h2>
                  <span>{severity.hint}</span>
                </div>
              </div>
              <div className="risk-confidence">
                <b>{Math.round(scenario.confidence * 100)}</b>
                <span>confidence</span>
              </div>
            </div>
            <div className="risk-divider" />
            {scenario.riskSignals.length ? (
              <div className="signal-list">
                {scenario.riskSignals.map((signal) => (
                  <div key={signal}>
                    <span className="signal-pin" />
                    <p>{signal}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-risk">
                <CheckCircleFilled />
                <div>
                  <b>未发现服务升级信号</b>
                  <p>风险结果来自规则与结构化特征，不推断主观情绪。</p>
                </div>
              </div>
            )}
          </article>

          <article className="panel evidence-card">
            <div className="section-heading">
              <div>
                <DatabaseOutlined />
                <h2>证据包</h2>
              </div>
              <Badge count={scenario.evidence.length} color="#243b67" />
            </div>
            <div className="evidence-list">
              {scenario.evidence.map((item) => (
                <div className="evidence-item" key={item.ref}>
                  <span className={`evidence-kind ${item.tone}`}>{item.kind}</span>
                  <div>
                    <b>{item.title}</b>
                    <p>{item.detail}</p>
                    <code>{item.ref}</code>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="panel review-card">
            <div className="review-header">
              <div className="icon-label green">
                <AuditOutlined />
                <span>Review Agent</span>
              </div>
              <Tag color="success" icon={<CheckCircleFilled />}>
                {scenario.review.label}
              </Tag>
            </div>
            <p>{scenario.review.detail}</p>
          </article>

          <article className="panel trace-card">
            <div className="section-heading trace-heading">
              <div>
                <HistoryOutlined />
                <h2>本轮运行 Trace</h2>
              </div>
              <span>{totalMs} ms</span>
            </div>
            <div className="trace-list">
              {scenario.trace.map((item, index) => (
                <div className="trace-row" key={item.name}>
                  <div className="trace-rail">
                    <span className={item.state} />
                    {index < scenario.trace.length - 1 && <i />}
                  </div>
                  <div className="trace-copy">
                    <div>
                      <b>{item.name}</b>
                      <time>{item.ms}ms</time>
                    </div>
                    <p>{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </aside>
      </section>
    </main>
  );
}

function Dashboard({ principal }: { principal: CurrentPrincipal | null }) {
  const [snapshot, setSnapshot] = useState<ApiDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvingCaseId, setResolvingCaseId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      setSnapshot(await getDashboard());
    } catch {
      setError("风险数据暂时不可用，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void getDashboard()
      .then((data) => {
        if (active) setSnapshot(data);
      })
      .catch(() => {
        if (active) setError("风险数据暂时不可用，请稍后重试。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const trendOption = useMemo<EChartsOption>(
    () => {
      const trend = snapshot?.risk_trend ?? [];
      return ({
      tooltip: { trigger: "axis", backgroundColor: "#172033", borderWidth: 0, textStyle: { color: "#fff" } },
      grid: { left: 14, right: 12, top: 30, bottom: 12, containLabel: true },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: trend.length
          ? trend.map((item) => item.date.slice(5))
          : ["暂无数据"],
        axisLine: { lineStyle: { color: "#e6e8ed" } },
        axisTick: { show: false },
        axisLabel: { color: "#8b93a3", fontSize: 11 },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: "#eef0f3" } },
        axisLabel: { color: "#8b93a3", fontSize: 11 },
      },
      series: [
        {
          name: "高风险会话",
          type: "line",
          smooth: 0.35,
          data: trend.length ? trend.map((item) => item.count) : [0],
          symbol: "circle",
          symbolSize: 7,
          lineStyle: { color: "#d9364f", width: 3 },
          itemStyle: { color: "#fff", borderColor: "#d9364f", borderWidth: 3 },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(217,54,79,.22)" },
                { offset: 1, color: "rgba(217,54,79,0)" },
              ],
            },
          },
        },
      ],
      });
    },
    [snapshot],
  );

  const issueOption = useMemo<EChartsOption>(
    () => {
      const issueDistribution = snapshot?.issue_distribution ?? [];
      return ({
      tooltip: { trigger: "item" },
      legend: {
        orient: "vertical",
        right: 4,
        top: "center",
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: "#5e6677", fontSize: 11 },
      },
      series: [
        {
          type: "pie",
          radius: ["48%", "72%"],
          center: ["32%", "52%"],
          avoidLabelOverlap: true,
          label: { show: false },
          data: (issueDistribution.length
            ? issueDistribution
            : [{ issue: "暂无数据", count: 1 }]
          ).map((item, index) => ({
            value: item.count,
            name: item.issue,
            itemStyle: {
              color: ["#2563eb", "#56a3a6", "#d9a441", "#d9364f", "#a4aabc"][
                index % 5
              ],
            },
          })),
        },
      ],
      });
    },
    [snapshot],
  );

  const totals = snapshot?.totals;
  const metrics = [
    {
      label: "持久化案例",
      value: totals?.cases ?? 0,
      detail: "D1 主记录",
      icon: <MessageOutlined />,
      tone: "blue",
    },
    {
      label: "高风险会话",
      value: (totals?.high ?? 0) + (totals?.critical ?? 0),
      detail: `严重 ${totals?.critical ?? 0}`,
      icon: <AlertOutlined />,
      tone: "red",
    },
    {
      label: "建议接受率",
      value: `${snapshot?.approval_rate ?? 0}%`,
      detail: `平均修改 ${snapshot?.average_edit_rate ?? 0}%`,
      icon: <CheckCircleFilled />,
      tone: "green",
    },
    {
      label: "待主管审批",
      value: totals?.pending_supervisor ?? 0,
      detail: `待客服 ${totals?.waiting_approval ?? 0}`,
      icon: <EditOutlined />,
      tone: "gold",
    },
  ];

  const downloadReport = () => {
    if (!snapshot) return;
    const rows = [
      ["指标", "数值"],
      ["案例总数", snapshot.totals.cases],
      ["高风险", snapshot.totals.high],
      ["严重风险", snapshot.totals.critical],
      ["待客服审批", snapshot.totals.waiting_approval],
      ["待主管审批", snapshot.totals.pending_supervisor],
      ["重复投诉", snapshot.totals.repeat_complaints],
      ["超时承诺", snapshot.totals.overdue_promises],
      ["待处理动作", snapshot.totals.pending_actions],
      ["死信动作", snapshot.totals.dead_letter_actions],
      ["建议接受率", `${snapshot.approval_rate}%`],
      ["平均修改率", `${snapshot.average_edit_rate}%`],
    ];
    const csv = rows.map((row) => row.join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    link.download = `carepulse-risk-${snapshot.generated_at.slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const resolveSupervisorCase = async (
    caseId: string,
    severity: string,
  ) => {
    setResolvingCaseId(caseId);
    setError("");
    try {
      await approveCase(
        caseId,
        "ESCALATE",
        "",
        severity === "CRITICAL" ? ["ESCALATE_PRODUCT_SAFETY"] : [],
      );
      await refresh();
    } catch {
      setError("主管审批未完成，案例状态或权限可能已变化。");
    } finally {
      setResolvingCaseId(null);
    }
  };

  return (
    <main className="dashboard-shell">
      <section className="dashboard-title">
        <div>
          <span className="eyebrow">RISK OPERATIONS</span>
          <h1>风险运行看板</h1>
          <p>由客服 Copilot 运行中产生的结构化风险事件聚合而成。</p>
        </div>
        <div className="dashboard-actions">
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={downloadReport}
            disabled={!snapshot}
          >
            导出本周报告
          </Button>
        </div>
      </section>

      {error && <div className="dashboard-error">{error}</div>}

      <section className="metric-grid">
        {metrics.map((item) => (
          <article className="metric-card" key={item.label}>
            <div className={`metric-icon ${item.tone}`}>{item.icon}</div>
            <div>
              <span>{item.label}</span>
              <strong>{loading ? "—" : item.value}</strong>
              <small>{item.detail}</small>
            </div>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="panel chart-card wide">
          <div className="chart-title">
            <div>
              <h2>高风险会话趋势</h2>
              <p>最近 7 个有事件日期 · D1 风险事件聚合</p>
            </div>
            <Tag color="error">
              严重 {snapshot?.totals.critical ?? 0}
            </Tag>
          </div>
          <EChart option={trendOption} className="trend-chart" />
        </article>
        <article className="panel chart-card">
          <div className="chart-title">
            <div>
              <h2>主要问题类型</h2>
              <p>当前授权范围内的真实案例结构</p>
            </div>
          </div>
          <EChart option={issueOption} className="issue-chart" />
        </article>
      </section>

      <section className="dashboard-lower">
        <article className="panel queue-card">
          <div className="chart-title">
            <div>
              <h2>待处理升级队列</h2>
              <p>按风险等级和更新时间排序</p>
            </div>
            <Tag>{snapshot?.queue.length ?? 0} 项</Tag>
          </div>
          <div className="queue-table">
            <div className="queue-row queue-head">
              <span>案例 / 状态</span>
              <span>风险事件</span>
              <span>等级</span>
              <span>更新时间</span>
              <span>负责人</span>
              <span>操作</span>
            </div>
            {(snapshot?.queue ?? []).map((row) => (
              <div className="queue-row" key={row.id}>
                <span>
                  <b>{row.id}</b>
                  <small>{row.state}</small>
                </span>
                <span>{row.issue}</span>
                <span>
                  <Tag color={row.severity === "CRITICAL" ? "error" : "volcano"}>
                    {row.severity}
                  </Tag>
                </span>
                <span>
                  <ClockCircleOutlined />{" "}
                  {new Date(row.updated_at).toLocaleString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span>{row.owner}</span>
                <span>
                  {row.state === "PENDING_SUPERVISOR_APPROVAL" &&
                  ["SUPERVISOR", "RISK_MANAGER", "ADMIN"].includes(
                    principal?.role ?? "AGENT",
                  ) ? (
                    <Button
                      size="small"
                      type="link"
                      loading={resolvingCaseId === row.id}
                      onClick={() =>
                        void resolveSupervisorCase(row.id, row.severity)
                      }
                    >
                      批准升级
                    </Button>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
            ))}
            {!loading && (snapshot?.queue.length ?? 0) === 0 && (
              <div className="queue-empty">当前没有待处理升级案例</div>
            )}
          </div>
        </article>

        <aside className="dashboard-side">
          <article className="panel sla-card">
            <div className="chart-title">
              <div>
                <h2>服务承诺健康度</h2>
                <p>基于未兑现承诺事件</p>
              </div>
            </div>
            <div className="sla-score">
              <div>
                <strong>
                  {Math.max(0, 100 - (totals?.overdue_promises ?? 0) * 10)}
                </strong>
                <span>/ 100</span>
              </div>
              <Progress
                percent={Math.max(
                  0,
                  100 - (totals?.overdue_promises ?? 0) * 10,
                )}
                showInfo={false}
                strokeColor="#13a671"
              />
            </div>
            <div className="sla-stats">
              <span>
                <b>{totals?.pending_actions ?? 0}</b> 待处理动作
              </span>
              <span>
                <b className="danger">
                  {totals?.dead_letter_actions ?? 0}
                </b>{" "}
                死信
              </span>
              <span>
                <b>{totals?.repeat_complaints ?? 0}</b> 重复投诉
              </span>
              <span>
                <b className="danger">{totals?.overdue_promises ?? 0}</b>{" "}
                超时承诺
              </span>
            </div>
          </article>
          <article className="principle-card">
            <SafetyCertificateOutlined />
            <div>
              <b>风险引擎健康</b>
              <p>
                硬规则优先；证据缺失进入 REVIEW_FAILED，异常默认人工复核。
              </p>
            </div>
          </article>
        </aside>
      </section>

      <section className="panel architecture-card">
        <div className="chart-title">
          <div>
            <h2>技术选型落实矩阵</h2>
            <p>与重构方案逐项对应，可由接口、持久化记录和 Engineering Harness 验证</p>
          </div>
          <Tag color="success">受控闭环</Tag>
        </div>
        <div className="architecture-grid">
          {[
            ["Harness", "鉴权、脱敏、幂等 Run、Trace 与事务审批"],
            ["3 个受控 Agent", "Triage / Copilot / Review 结构化 Artifact"],
            ["确定性服务", "Risk / Evidence / ToolPolicy / CaseWorkflow"],
            ["人工审批门", "接受、编辑、拒绝、请求主管与主管升级"],
            ["Transactional Outbox", "CAS 抢占、重试、退避、死信、幂等执行"],
            ["REST + SSE", "断线轮询降级、事件游标、心跳与中止处理"],
            ["D1 / PostgreSQL", "线上持久化 + LangGraph/pgvector 生产参考"],
            ["Engineering Harness", "路由、风险、证据、权限、并发与工具测试"],
          ].map(([title, detail]) => (
            <div key={title}>
              <CheckCircleFilled />
              <span>
                <b>{title}</b>
                <small>{detail}</small>
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function EvaluationEvidence() {
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      setReport(await getEvaluationReport());
    } catch {
      setError("评测报告暂时不可用，请稍后重新计算。");
    }
  };

  useEffect(() => {
    let active = true;
    void getEvaluationReport()
      .then((result) => {
        if (active) setReport(result);
      })
      .catch(() => {
        if (active) setError("评测报告暂时不可用，请稍后重新计算。");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="evaluation-shell">
      <section className="evaluation-hero">
        <div>
          <span className="eyebrow">COMPETITION EVIDENCE</span>
          <h1>不是功能清单，是可复现的效果证据</h1>
          <p>
            每次打开都从同一套匿名化测试集重新计算；公开局限，不把工程回归冒充真实业务提升。
          </p>
        </div>
        <div className="evaluation-stamp">
          <ExperimentOutlined />
          <div>
            <strong>{report?.methodology.cases ?? "—"}</strong>
            <span>条美妆客服案例</span>
          </div>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            重新计算
          </Button>
        </div>
      </section>

      {error && <div className="dashboard-error">{error}</div>}

      <section className="evaluation-summary">
        <article>
          <span>评测口径</span>
          <p>{report?.methodology.suite ?? "正在加载评测口径…"}</p>
        </article>
        <article>
          <span>对照基线</span>
          <p>{report?.methodology.baseline ?? "正在加载基线说明…"}</p>
        </article>
        <article className="limitation">
          <span>诚实边界</span>
          <p>{report?.methodology.limitation ?? "正在加载限制说明…"}</p>
        </article>
      </section>

      <section className="panel evaluation-metrics">
        <div className="chart-title">
          <div>
            <h2>CarePulse Harness vs. 固定模板基线</h2>
            <p>结果由 /api/v1/evaluation 在线计算，目标值来自当前验收门槛</p>
          </div>
          <Tag color="success">{report?.report_version ?? "CALCULATING"}</Tag>
        </div>
        <div className="evaluation-table">
          <div className="evaluation-row evaluation-head">
            <span>指标</span>
            <span>CarePulse</span>
            <span>基线</span>
            <span>验收目标</span>
          </div>
          {(report?.metrics ?? []).map((metric) => (
            <div className="evaluation-row" key={metric.key}>
              <span>
                <b>{metric.label}</b>
                <small>{metric.key}</small>
              </span>
              <span className="score-cell carepulse-score">
                <strong>{metric.carepulse}%</strong>
                <Progress
                  percent={metric.carepulse}
                  showInfo={false}
                  strokeColor="#13a671"
                />
              </span>
              <span className="score-cell baseline-score">
                <strong>{metric.baseline}%</strong>
                <Progress
                  percent={metric.baseline}
                  showInfo={false}
                  strokeColor="#9ca5b3"
                />
              </span>
              <span>
                <Tag color="blue">{metric.target}</Tag>
              </span>
            </div>
          ))}
          {!report && <div className="evaluation-loading">正在执行 60 条回归案例…</div>}
        </div>
      </section>

      <section className="evaluation-lower">
        <article className="panel">
          <div className="chart-title">
            <div>
              <h2>场景切片通过情况</h2>
              <p>必须同时通过路由、风险、引用、承诺和独立审查</p>
            </div>
          </div>
          <div className="slice-grid">
            {(report?.slices ?? []).map((slice) => (
              <div key={slice.name}>
                <span>{slice.name}</span>
                <strong>
                  {slice.passed}/{slice.cases}
                </strong>
                <Progress
                  percent={(slice.passed / slice.cases) * 100}
                  showInfo={false}
                  strokeColor={
                    slice.passed === slice.cases ? "#13a671" : "#d9364f"
                  }
                />
                <small>{slice.note}</small>
              </div>
            ))}
          </div>
        </article>
        <article className="panel claim-card">
          <div className="chart-title">
            <div>
              <h2>本报告可以证明什么</h2>
              <p>只陈述当前测试能够支持的结论</p>
            </div>
          </div>
          <div className="claim-list">
            {(report?.claims ?? []).map((claim) => (
              <div key={claim}>
                <CheckCircleFilled />
                <span>{claim}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

export default function Home() {
  const [view, setView] = useState<ViewKey>("workbench");
  const [scenario, setScenario] = useState<ScenarioKey>("refund");
  const [customInput, setCustomInput] = useState<RunInput | null>(null);
  const [principal, setPrincipal] = useState<CurrentPrincipal | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all([getCurrentPrincipal(), getDashboard()])
      .then(([identity, dashboard]) => {
        if (!active) return;
        setPrincipal(identity);
        setPendingApprovals(
          dashboard.totals.waiting_approval +
            dashboard.totals.pending_supervisor,
        );
      })
      .catch(() => {
        if (!active) return;
        setPrincipal({
          email: "local-agent@carepulse.invalid",
          display_name: "本地客服",
          role: "AGENT",
        });
      });
    return () => {
      active = false;
    };
  }, []);

  const roleLabel: Record<string, string> = {
    AGENT: "客服专员",
    SUPERVISOR: "客服主管",
    RISK_MANAGER: "风险经理",
    ADMIN: "系统管理员",
  };
  const displayName = principal?.display_name || principal?.email || "正在识别";
  const avatarText = displayName.slice(0, 1).toUpperCase();

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#1e5eff",
          borderRadius: 10,
          colorText: "#172033",
          colorBgContainer: "#ffffff",
          fontFamily:
            '"Inter", "SF Pro Display", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
        },
        components: {
          Button: { controlHeight: 36, fontWeight: 600 },
          Tag: { borderRadiusSM: 6 },
        },
      }}
    >
      <div className="app-frame">
        <header className="topbar">
          <div className="brand">
            <ProductMark />
            <div className="brand-copy">
              <strong>CarePulse</strong>
              <span>证据驱动客服 Copilot</span>
            </div>
            <Tag className="mvp-tag">EVAL BUILD</Tag>
          </div>

          <Segmented
            className="view-switch"
            value={view}
            onChange={(value) => setView(value as ViewKey)}
            options={[
              {
                value: "workbench",
                label: (
                  <span>
                    <MessageOutlined /> 客服工作台
                  </span>
                ),
              },
              {
                value: "dashboard",
                label: (
                  <span>
                    <DashboardOutlined /> 风险看板
                  </span>
                ),
              },
              {
                value: "evaluation",
                label: (
                  <span>
                    <ExperimentOutlined /> 评测证据
                  </span>
                ),
              },
            ]}
          />

          <div className="top-actions">
            <div className="system-health">
              <span />
              运行证据可核验
            </div>
            <Tooltip title={`当前授权范围：待审批 ${pendingApprovals} 项`}>
              <Badge count={pendingApprovals} size="small">
                <Button shape="circle" icon={<AuditOutlined />} aria-label="审批通知" />
              </Badge>
            </Tooltip>
            <div className="operator">
              <Avatar size={34}>{avatarText}</Avatar>
              <div>
                <b>{displayName}</b>
                <span>{roleLabel[principal?.role ?? "AGENT"]}</span>
              </div>
            </div>
          </div>
        </header>

        {view === "workbench" ? (
          <Workbench
            key={`${scenario}-${customInput?.conversation_id ?? "preset"}`}
            scenarioKey={scenario}
            onScenario={setScenario}
            principal={principal}
            customInput={customInput}
            onCustomRun={(input) => {
              setCustomInput(input);
              setScenario("challenge");
            }}
          />
        ) : view === "dashboard" ? (
          <Dashboard principal={principal} />
        ) : (
          <EvaluationEvidence />
        )}
      </div>
    </ConfigProvider>
  );
}
