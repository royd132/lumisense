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
  ApiAnalysis,
  approveCase,
  CAREPULSE_API_ENABLED,
  RunInput,
  startRun,
} from "./lib/carepulse-api";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type ScenarioKey = "faq" | "refund" | "safety";
type ViewKey = "workbench" | "dashboard";

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
};

const scenarios: Record<ScenarioKey, Scenario> = {
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
  },
};

const processingSteps = [
  "正在理解消费者诉求",
  "正在检查风险信号",
  "正在并行获取业务证据",
  "正在生成建议回复",
  "正在执行独立审查",
];

const runInputs: Record<ScenarioKey, RunInput> = {
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

function scenarioFromApi(base: Scenario, result: ApiAnalysis): Scenario {
  const evidenceTone = (type: string): Evidence["tone"] =>
    type === "ORDER" ? "blue" : type.includes("POLICY") || type.includes("SOP") ? "gold" : type === "PRODUCT" ? "green" : "violet";
  const evidenceKind = (type: string): Evidence["kind"] =>
    type === "ORDER" ? "订单" : type === "PRODUCT" ? "产品" : type.includes("HISTORY") || type === "PROMISE" ? "历史" : "政策";

  return {
    ...base,
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
}: {
  scenarioKey: ScenarioKey;
  onScenario: (key: ScenarioKey) => void;
}) {
  const baseScenario = scenarios[scenarioKey];
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!CAREPULSE_API_ENABLED) return;
    let active = true;
    void startRun(runInputs[scenarioKey], (node) => {
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
  }, [baseScenario, scenarioKey]);

  const switchScenario = (key: ScenarioKey) => {
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

  const approve = async () => {
    if (liveCaseId) {
      try {
        const changed = draft !== scenario.draft;
        const decision = scenario.severity === "CRITICAL" ? "ESCALATE" : changed ? "EDIT" : "ACCEPT";
        const result = await approveCase(
          liveCaseId,
          decision,
          draft,
          selectedActionIds,
        );
        setNotice(
          `审批已落库，状态 ${result.state}；${result.outbox_event_ids.length} 项明确选择的动作已进入 Outbox。`,
        );
      } catch {
        setNotice("审批未通过权限或状态校验，未写入任何副作用。");
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

  const reject = async () => {
    if (liveCaseId) {
      try {
        await approveCase(liveCaseId, "REJECT", draft, []);
        setNotice("已拒绝本次建议，审批记录已保存，未创建副作用。");
      } catch {
        setNotice("拒绝操作未完成，请刷新运行状态后重试。");
      }
      return;
    }
    setNotice("已拒绝本次建议，拒绝原因与当前草稿已写入审批记录。");
  };

  const severity = severityMeta[scenario.severity];
  const totalMs = scenario.trace.reduce((sum, item) => sum + item.ms, 0);

  return (
    <main className="workbench-shell">
      <section className="scenario-strip" aria-label="演示场景">
        <div className="scenario-intro">
          <span className="eyebrow">DEMO PATHS</span>
          <strong>三条可验证业务链路</strong>
        </div>
        <div className="scenario-options">
          {(Object.keys(scenarios) as ScenarioKey[]).map((key) => {
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
              ? "REST + SSE + D1 · CN"
              : runtimeMode === "connecting"
                ? "正在验证运行时"
                : "无后端副作用"}
          </small>
        </div>
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
                  />
                </Tooltip>
                <Button danger icon={<CloseOutlined />} onClick={reject}>
                  拒绝
                </Button>
                <Button
                  icon={<ArrowUpOutlined />}
                  onClick={() => setNotice("已转入主管人工处理队列，当前建议不会被自动发送。")}
                >
                  升级
                </Button>
                <Button type="primary" icon={<CheckOutlined />} onClick={approve} data-testid="approve-action">
                  {scenario.severity === "CRITICAL" ? "批准升级计划" : "接受建议"}
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

function Dashboard() {
  const trendOption = useMemo<EChartsOption>(
    () => ({
      tooltip: { trigger: "axis", backgroundColor: "#172033", borderWidth: 0, textStyle: { color: "#fff" } },
      grid: { left: 14, right: 12, top: 30, bottom: 12, containLabel: true },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: ["7/24", "7/25", "7/26", "7/27", "7/28", "7/29", "今天"],
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
          data: [12, 15, 11, 18, 16, 24, 19],
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
    }),
    [],
  );

  const issueOption = useMemo<EChartsOption>(
    () => ({
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
          data: [
            { value: 36, name: "退款/退货", itemStyle: { color: "#2563eb" } },
            { value: 25, name: "产品咨询", itemStyle: { color: "#56a3a6" } },
            { value: 18, name: "物流问题", itemStyle: { color: "#d9a441" } },
            { value: 12, name: "不良反应", itemStyle: { color: "#d9364f" } },
            { value: 9, name: "其他", itemStyle: { color: "#a4aabc" } },
          ],
        },
      ],
    }),
    [],
  );

  const queue = [
    { id: "CASE-2418", name: "陈女士", issue: "不良反应 + 舆情传播", severity: "严重", wait: "3 分钟", owner: "待分配" },
    { id: "CASE-2407", name: "周女士", issue: "重复退款投诉", severity: "高", wait: "18 分钟", owner: "王悦" },
    { id: "CASE-2396", name: "苏先生", issue: "产品真伪质疑", severity: "高", wait: "31 分钟", owner: "李婷" },
    { id: "CASE-2388", name: "赵女士", issue: "隐私数据投诉", severity: "高", wait: "46 分钟", owner: "陈默" },
  ];

  return (
    <main className="dashboard-shell">
      <section className="dashboard-title">
        <div>
          <span className="eyebrow">RISK OPERATIONS</span>
          <h1>风险运行看板</h1>
          <p>由客服 Copilot 运行中产生的结构化风险事件聚合而成。</p>
        </div>
        <div className="dashboard-actions">
          <Button icon={<ReloadOutlined />}>刷新</Button>
          <Button type="primary" icon={<SendOutlined />}>
            导出本周报告
          </Button>
        </div>
      </section>

      <section className="metric-grid">
        {[
          { label: "今日服务会话", value: "1,284", delta: "+8.2%", icon: <MessageOutlined />, tone: "blue" },
          { label: "高风险会话", value: "19", delta: "-12.4%", icon: <AlertOutlined />, tone: "red" },
          { label: "建议接受率", value: "87.6%", delta: "+3.1%", icon: <CheckCircleFilled />, tone: "green" },
          { label: "平均人工修改", value: "12.8%", delta: "-2.7%", icon: <EditOutlined />, tone: "gold" },
        ].map((item) => (
          <article className="metric-card" key={item.label}>
            <div className={`metric-icon ${item.tone}`}>{item.icon}</div>
            <div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small className={item.delta.startsWith("-") && item.label !== "高风险会话" ? "down" : ""}>
                {item.delta} <i>较昨日</i>
              </small>
            </div>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="panel chart-card wide">
          <div className="chart-title">
            <div>
              <h2>高风险会话趋势</h2>
              <p>过去 7 天 · 硬规则与结构化风险合并结果</p>
            </div>
            <Tag color="error">今日 19</Tag>
          </div>
          <EChart option={trendOption} className="trend-chart" />
        </article>
        <article className="panel chart-card">
          <div className="chart-title">
            <div>
              <h2>主要问题类型</h2>
              <p>今日会话结构</p>
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
              <p>副作用尚未执行，等待授权处理</p>
            </div>
            <Button type="link">查看全部</Button>
          </div>
          <div className="queue-table">
            <div className="queue-row queue-head">
              <span>案例 / 消费者</span>
              <span>风险事件</span>
              <span>等级</span>
              <span>等待时间</span>
              <span>负责人</span>
            </div>
            {queue.map((row) => (
              <div className="queue-row" key={row.id}>
                <span>
                  <b>{row.id}</b>
                  <small>{row.name}</small>
                </span>
                <span>{row.issue}</span>
                <span>
                  <Tag color={row.severity === "严重" ? "error" : "volcano"}>{row.severity}</Tag>
                </span>
                <span>
                  <ClockCircleOutlined /> {row.wait}
                </span>
                <span>{row.owner}</span>
              </div>
            ))}
          </div>
        </article>

        <aside className="dashboard-side">
          <article className="panel sla-card">
            <div className="chart-title">
              <div>
                <h2>服务承诺健康度</h2>
                <p>当前未关闭承诺</p>
              </div>
            </div>
            <div className="sla-score">
              <div>
                <strong>92</strong>
                <span>/ 100</span>
              </div>
              <Progress percent={92} showInfo={false} strokeColor="#13a671" />
            </div>
            <div className="sla-stats">
              <span>
                <b>7</b> 即将超时
              </span>
              <span>
                <b className="danger">3</b> 已超时
              </span>
            </div>
          </article>
          <article className="principle-card">
            <SafetyCertificateOutlined />
            <div>
              <b>风险引擎健康</b>
              <p>模型异常时默认进入 REVIEW_REQUIRED，不会静默降级为低风险。</p>
            </div>
          </article>
        </aside>
      </section>
    </main>
  );
}

export default function Home() {
  const [view, setView] = useState<ViewKey>("workbench");
  const [scenario, setScenario] = useState<ScenarioKey>("refund");

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
            <Tag className="mvp-tag">MVP</Tag>
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
            ]}
          />

          <div className="top-actions">
            <div className="system-health">
              <span />
              系统稳定
            </div>
            <Tooltip title="今日待审批 6 项">
              <Badge count={6} size="small">
                <Button shape="circle" icon={<AuditOutlined />} aria-label="审批通知" />
              </Badge>
            </Tooltip>
            <div className="operator">
              <Avatar size={34}>王</Avatar>
              <div>
                <b>王悦</b>
                <span>高级客服</span>
              </div>
            </div>
          </div>
        </header>

        {view === "workbench" ? (
          <Workbench key={scenario} scenarioKey={scenario} onScenario={setScenario} />
        ) : (
          <Dashboard />
        )}
      </div>
    </ConfigProvider>
  );
}
