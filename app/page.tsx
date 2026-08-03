"use client";

import {
  AlertOutlined,
  ArrowRightOutlined,
  AuditOutlined,
  CheckCircleFilled,
  CheckOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  EyeOutlined,
  HeartOutlined,
  HistoryOutlined,
  LockOutlined,
  MessageOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  TeamOutlined,
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
  Select,
  Tag,
  Tooltip,
} from "antd";
import type { EChartsOption } from "echarts";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  approveCase,
  CAREPULSE_API_ENABLED,
  getEvaluationReport,
  startRun,
  submitLumiSenseFeedback,
  updateBrandPersona,
  type EvaluationReport,
  type RunInput,
} from "./lib/carepulse-api";
import {
  coldStartStats,
  insightFromRun,
  permissionMatrix,
  riskAlerts,
  riskMetrics,
  roleProfiles,
  roleViews,
  scenarioInputs,
  scenarios,
  teamRanking,
  type LumiInsight,
  type LumiRole,
  type LumiScenarioKey,
  type LumiView,
} from "./lib/lumisense-demo";

const scenarioOrder: Exclude<LumiScenarioKey, "challenge">[] = [
  "allergy",
  "pregnancy",
  "acne",
  "gift",
  "expectation",
];

const viewLabels: Record<LumiView, { label: string; icon: React.ReactNode }> = {
  workspace: { label: "智能接待", icon: <MessageOutlined /> },
  risk: { label: "风险预警", icon: <DashboardOutlined /> },
  growth: { label: "共情成长", icon: <HeartOutlined /> },
  evolution: { label: "进化中心", icon: <ExperimentOutlined /> },
};

const scenarioMeta: Record<Exclude<LumiScenarioKey, "challenge">, { index: string; label: string; accent: string }> = {
  allergy: { index: "01", label: "过敏急救", accent: "red" },
  pregnancy: { index: "02", label: "孕期安全", accent: "amber" },
  acne: { index: "03", label: "爆痘投诉", accent: "red" },
  gift: { index: "04", label: "送礼推荐", accent: "green" },
  expectation: { index: "05", label: "效果落差", accent: "amber" },
};

function EChart({ option, className = "", label }: { option: EChartsOption; className?: string; label: string }) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let chart: import("echarts").ECharts | undefined;
    let disposed = false;
    const resize = () => chart?.resize();
    void import("echarts").then((echarts) => {
      if (disposed || !chartRef.current) return;
      chart = echarts.init(chartRef.current);
      chart.setOption(option);
      window.addEventListener("resize", resize);
    });
    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      chart?.dispose();
    };
  }, [option]);

  return <div ref={chartRef} className={`echart ${className}`} role="img" aria-label={label} />;
}

function LumiMark() {
  return (
    <span className="lumi-mark" aria-hidden="true">
      <i />
      <b />
      <em />
    </span>
  );
}

function SectionHead({ eyebrow, title, extra }: { eyebrow: string; title: string; extra?: React.ReactNode }) {
  return (
    <div className="section-head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {extra}
    </div>
  );
}

function RoleGate({ role, allow, children }: { role: LumiRole; allow: LumiRole[]; children: React.ReactNode }) {
  if (allow.includes(role)) return <>{children}</>;
  return (
    <div className="role-gate">
      <span className="gate-icon"><LockOutlined /></span>
      <div>
        <b>当前角色不可执行</b>
        <p>{roleProfiles[role].label}仅保留 PRD 权限矩阵允许的能力。</p>
      </div>
    </div>
  );
}

function RuntimeProof({ insight, running, activeNode }: { insight: LumiInsight; running: boolean; activeNode: string }) {
  const live = insight.runtime.model_mode === "LIVE_MODEL";
  return (
    <div className="runtime-proof">
      <span className={`runtime-dot ${running ? "is-running" : live ? "is-live" : "is-fallback"}`} />
      <div>
        <b>{running ? "AGENTLOOP RUNNING" : live ? "LIVE MODEL" : "SAFE FALLBACK"}</b>
        <small>{running ? activeNode || "正在规划子 Agent" : `${insight.runtime.harness} · ${insight.runtime.model}`}</small>
      </div>
    </div>
  );
}

function ConversationRail({ active, onSelect }: { active: LumiScenarioKey; onSelect: (key: Exclude<LumiScenarioKey, "challenge">) => void }) {
  return (
    <aside className="conversation-rail">
      <div className="rail-heading">
        <div>
          <span className="eyebrow">LIVE QUEUE</span>
          <h2>当前会话</h2>
        </div>
        <Badge count={20} overflowCount={99} color="#534ab7" />
      </div>
      <label className="search-field">
        <span>⌕</span>
        <input aria-label="搜索会话" placeholder="搜索消费者 / 场景" />
      </label>
      <div className="queue-groups">
        <span>演示必跑 · 5 个场景</span>
        {scenarioOrder.map((key) => {
          const item = scenarios[key];
          const meta = scenarioMeta[key];
          return (
            <button key={key} className={`conversation-item ${active === key ? "active" : ""}`} onClick={() => onSelect(key)}>
              <span className={`scenario-index ${meta.accent}`}>{meta.index}</span>
              <span className="conversation-copy">
                <b>{item.consumer.name}<small>{meta.label}</small></b>
                <em>{item.messages.at(-1)?.text}</em>
              </span>
              <span className={`risk-pin ${item.perception.risk}`} />
            </button>
          );
        })}
      </div>
      <div className="knowledge-mini">
        <DatabaseOutlined />
        <div><b>美妆知识图谱</b><span>12 场景 · 50+ 成分 · 7 品牌</span></div>
        <CheckCircleFilled />
      </div>
    </aside>
  );
}

function ChatStage({
  insight,
  draft,
  onDraft,
  onSend,
  role,
}: {
  insight: LumiInsight;
  draft: string;
  onDraft: (value: string) => void;
  onSend: () => void;
  role: LumiRole;
}) {
  const canSend = role !== "viewer";
  return (
    <section className="chat-stage">
      <header className="consumer-header">
        <div className="consumer-identity">
          <Avatar size={44} className="consumer-avatar">{insight.consumer.name.slice(0, 1)}</Avatar>
          <div>
            <h1>{insight.consumer.name} <Tag>{insight.consumer.vip}</Tag></h1>
            <p>{insight.consumer.skinType} · {insight.consumer.personality} · {insight.consumer.history}</p>
          </div>
        </div>
        <div className="consumer-actions">
          <Tag color={insight.perception.risk === "red" ? "red" : insight.perception.risk === "yellow" ? "gold" : "green"}>{insight.perception.riskLabel}</Tag>
          <Tooltip title={role === "agent_junior" ? "新手客服无转接权限" : "转接给资深客服"}>
            <Button disabled={role === "agent_junior" || role === "viewer"}>转接</Button>
          </Tooltip>
          <Button icon={<AuditOutlined />} disabled={!['agent_senior', 'supervisor', 'admin'].includes(role)}>接管</Button>
        </div>
      </header>

      <div className="profile-strip">
        <span><b>当前关注</b>{insight.consumer.concern}</span>
        <span><b>敏感成分</b>{insight.consumer.allergies.length ? insight.consumer.allergies.join(" / ") : "未记录"}</span>
        <span><b>品牌域</b>{insight.brand}</span>
      </div>

      <div className="message-scroll">
        <div className="conversation-date">今天 · LumiSense 已读取最近 3 轮上下文</div>
        {insight.messages.map((message, index) => (
          <div key={`${message.time}-${index}`} className={`message-row ${message.by}`}>
            {message.by === "consumer" && <Avatar size={30}>{insight.consumer.name.slice(0, 1)}</Avatar>}
            <div>
              <span className="message-meta">{message.by === "consumer" ? insight.consumer.name : "客服"} · {message.time}</span>
              <div className="message-bubble">{message.text}</div>
              {message.imageLabel && (
                <div className="image-evidence"><EyeOutlined /><span>{message.imageLabel}<small>图片仅作 Demo 标签，不执行医学图像诊断</small></span></div>
              )}
            </div>
          </div>
        ))}
        <div className="ai-divider"><span><LumiMark /> LumiSense 正在辅助，不会自动发送或承诺</span></div>
      </div>

      <div className="composer-shell">
        <div className="composer-toolbar">
          <span>AI 草稿 · 人工编辑区</span>
          <span className="score-chip"><HeartOutlined /> 预计共情分 {insight.empathy.total}</span>
        </div>
        <textarea value={draft} onChange={(event) => onDraft(event.target.value)} aria-label="客服回复草稿" />
        <div className="composer-footer">
          <span>所有外部动作需人工确认 · 已启用禁用词检测</span>
          <Button type="primary" icon={<SendOutlined />} disabled={!canSend || !draft.trim()} onClick={onSend}>人工发送</Button>
        </div>
      </div>
    </section>
  );
}

function PerceptionCard({ insight }: { insight: LumiInsight }) {
  return (
    <article className="sense-card insight-card">
      <SectionHead eyebrow="SENSE · 实时感知" title="三轴信号已对齐" extra={<Tag className={`risk-tag ${insight.perception.risk}`}>{insight.perception.riskLabel}</Tag>} />
      <div className="sense-grid">
        <div><span>意图</span><b>{insight.perception.intent}</b></div>
        <div><span>情绪</span><b>{insight.perception.emotion}</b><Progress percent={Math.round(insight.perception.intensity * 100)} showInfo={false} size="small" strokeColor="#a32d2d" /></div>
        <div><span>皮肤轴</span><b>{insight.perception.skin}</b></div>
        <div><span>产品轴</span><b>{insight.perception.product}</b></div>
      </div>
      {insight.riskSignals.length > 0 && <div className="signal-row">{insight.riskSignals.map((signal) => <Tag key={signal} color="red">{signal}</Tag>)}</div>}
    </article>
  );
}

function ArchaeologyCard({ insight }: { insight: LumiInsight }) {
  const archaeology = insight.archaeology;
  const enoughEvidence = archaeology.turns.length >= 3 && archaeology.confidence >= 0.6;
  return (
    <article className="archaeology-card insight-card wow-card">
      <div className="wow-ribbon">WOW 01</div>
      <SectionHead
        eyebrow="EMOTION ARCHAEOLOGIST · 多轮时序因果诊断"
        title="情绪考古师"
        extra={<span className={`archaeology-confidence ${enoughEvidence ? "ready" : "insufficient"}`}>{enoughEvidence ? `诊断置信度 ${Math.round(archaeology.confidence * 100)}%` : "证据不足 · 拒绝伪因果"}</span>}
      />
      <div className="archaeology-layout">
        <section className="archaeology-timeline" aria-label="多轮会话情绪时间线">
          <div className="archaeology-label"><HistoryOutlined /> 对话时间线回溯 <span>输入：{archaeology.turns.length} 轮会话</span></div>
          <div className="turn-stack">
            {archaeology.turns.map((turn) => (
              <div key={turn.round} className={`archaeology-turn ${turn.state}`}>
                <span className="turn-round">{turn.round}</span>
                <span className="turn-copy"><b>{turn.speaker}</b><em>“{turn.quote}”</em></span>
                <strong>{turn.score}</strong>
                {turn.round === archaeology.turningPoint.round && <i className="turning-badge">情绪转折</i>}
              </div>
            ))}
          </div>
          {enoughEvidence && (
            <div className="turning-point-callout">
              <span>{archaeology.turningPoint.round}</span>
              <p><b>{archaeology.turningPoint.from} → {archaeology.turningPoint.to}</b>{archaeology.turningPoint.trigger}</p>
            </div>
          )}
        </section>
        <section className="causal-diagnosis">
          <div className="diagnosis-block root-cause">
            <span>病因诊断</span>
            <p>{archaeology.rootCause}</p>
          </div>
          <div className="causal-chain" aria-label="会话因果链">
            {archaeology.causalChain.map((item, index) => (
              <span key={`${item}-${index}`}>{item}{index < archaeology.causalChain.length - 1 && <ArrowRightOutlined />}</span>
            ))}
          </div>
          <div className="diagnosis-block prescription">
            <span>处方建议</span>
            <p><b>不要：</b>{archaeology.avoid}</p>
            <p><b>要做：</b>{archaeology.prescription}</p>
          </div>
          <div className="evidence-strip">
            <span>证据锚点</span>
            {archaeology.evidenceRounds.map((round) => <b key={round}>{round}</b>)}
            <em>基于整段会话回溯</em>
          </div>
        </section>
      </div>
    </article>
  );
}

function SubtextCard({ insight, onFeedback }: { insight: LumiInsight; onFeedback: (verdict: "accurate" | "inaccurate") => void }) {
  return (
    <article className="xray-card insight-card">
      <SectionHead eyebrow="REAL-TIME ASSIST · 单轮辅助" title="潜台词摘要" extra={<span className="confidence">辅助置信度 {Math.round(insight.subtext.confidence * 100)}%</span>} />
      <div className="xray-stack">
        <div><span>表面语义</span><p>{insight.subtext.surface}</p></div>
        <div><span>真实情绪</span><p>{insight.subtext.emotion}</p></div>
        <div className="xray-focus"><span>没说出口</span><p>“{insight.subtext.hidden}”</p></div>
        <div><span>应对方向</span><p>{insight.subtext.strategy}</p></div>
      </div>
      <div className="feedback-row">
        <span>辅助判断准确吗？</span>
        <Button size="small" icon={<CheckOutlined />} onClick={() => onFeedback("accurate")}>准确</Button>
        <Button size="small" onClick={() => onFeedback("inaccurate")}>需修正</Button>
      </div>
    </article>
  );
}

function ProphetCard({ insight, onApply, onFeedback }: { insight: LumiInsight; onApply: () => void; onFeedback: (verdict: "accurate" | "partially") => void }) {
  const option = useMemo<EChartsOption>(() => {
    const rounds = ["R1", "R2", "R3", "NOW", "R5", "R6", "R7"];
    const observed = [...insight.observed, null, null, null];
    const future = (scores: number[]) => [null, null, null, insight.observed.at(-1), ...scores];
    return {
      animationDuration: 500,
      grid: { left: 31, right: 14, top: 24, bottom: 25 },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: rounds, boundaryGap: false, axisLine: { lineStyle: { color: "#d9d6ea" } }, axisLabel: { color: "#77738a", fontSize: 10 } },
      yAxis: { type: "value", min: 0, max: 100, splitNumber: 4, axisLabel: { color: "#918ca3", fontSize: 9 }, splitLine: { lineStyle: { color: "#efedf7" } } },
      series: [
        { name: "已观测", type: "line", data: observed, symbolSize: 7, lineStyle: { width: 3, color: "#534ab7" }, itemStyle: { color: "#534ab7" } },
        { name: "继续当前", type: "line", data: future(insight.paths[0].scores), connectNulls: true, symbol: "none", lineStyle: { type: "dashed", width: 2, color: "#a32d2d" } },
        { name: "标准安抚", type: "line", data: future(insight.paths[1].scores), connectNulls: true, symbol: "none", lineStyle: { type: "dashed", width: 2, color: "#ba7517" } },
        { name: "深度共情", type: "line", data: future(insight.paths[2].scores), connectNulls: true, symbolSize: 6, lineStyle: { width: 3, color: "#0f6e56" }, itemStyle: { color: "#0f6e56" } },
      ],
    };
  }, [insight]);

  return (
    <article className="prophet-card insight-card wow-card">
      <div className="wow-ribbon">WOW 02</div>
      <SectionHead eyebrow="EMOTION PROPHET" title="未来 3 轮情绪预言" extra={<Tag color="red">NOW {insight.observed.at(-1)} / 100</Tag>} />
      <EChart option={option} className="prophet-chart" label="三条情绪预测路径" />
      <div className="path-list">
        {insight.paths.map((path) => (
          <div key={path.key} className={`path-row ${path.tone}`}>
            <span>Path {path.key.toUpperCase()}</span>
            <b>{path.label}</b>
            <em>R7 {path.scores.at(-1)} · 挽回 {path.probability}%</em>
            {path.key === "c" && <Tag color="green">推荐</Tag>}
          </div>
        ))}
      </div>
      <p className="prophet-reason"><ThunderboltFilled /> {insight.recommendationReason}</p>
      <div className="card-actions">
        <Button type="primary" onClick={onApply}>应用 Path C 话术</Button>
        <Button onClick={() => onFeedback("partially")}>反馈准确度</Button>
      </div>
    </article>
  );
}

function ScriptsCard({ insight, onUse }: { insight: LumiInsight; onUse: (text: string) => void }) {
  return (
    <article className="scripts-card insight-card">
      <SectionHead eyebrow="RESPOND · 共情话术" title="两条可编辑建议" extra={<span className="temperature">语言温度 +19</span>} />
      <div className="script-list">
        {insight.scripts.map((script, index) => (
          <button key={script.label} onClick={() => onUse(script.text)} className={index === 0 ? "recommended" : ""}>
            <span>{script.label}<em>预计 {script.score} 分</em></span>
            <p>{script.text}</p>
            <b>填入回复框 <ArrowRightOutlined /></b>
          </button>
        ))}
      </div>
    </article>
  );
}

function ProductMatchCard({ insight }: { insight: LumiInsight }) {
  return (
    <article className={`product-card insight-card ${insight.product.gated ? "is-gated" : ""}`}>
      <SectionHead eyebrow="RESOLVE · 三轴匹配" title={insight.product.name} extra={<Tag color={insight.product.gated ? "gold" : "green"}>{insight.product.price}</Tag>} />
      <div className="product-brand">{insight.product.brand}</div>
      <p>{insight.product.reason}</p>
      <div className="ingredient-row">{insight.product.ingredients.map((item) => <span key={item}>{item}</span>)}</div>
      <dl>
        <div><dt>备选</dt><dd>{insight.product.alternatives.join(" · ")}</dd></div>
        <div><dt>使用建议</dt><dd>{insight.product.guide}</dd></div>
        <div className="taboo"><dt>禁忌</dt><dd>{insight.product.taboo}</dd></div>
      </dl>
      <div className="card-actions">
        <Button type="primary" disabled={insight.product.gated}>{insight.product.gated ? "等待安全复核" : "生成推荐卡"}</Button>
        <Button>查看证据</Button>
      </div>
    </article>
  );
}

function EmpathyCard({ insight }: { insight: LumiInsight }) {
  const option = useMemo<EChartsOption>(() => ({
    radar: { indicator: [
      { name: "情绪识别", max: 100 },
      { name: "痛点回应", max: 100 },
      { name: "方案有效", max: 100 },
      { name: "语言温度", max: 100 },
      { name: "品牌契合", max: 100 },
    ], radius: "62%", splitNumber: 4, axisName: { color: "#5b576d", fontSize: 10 }, splitArea: { areaStyle: { color: ["#faf9fd", "#f4f1fb"] } }, axisLine: { lineStyle: { color: "#ddd8ed" } }, splitLine: { lineStyle: { color: "#ddd8ed" } } },
    series: [{ type: "radar", data: [{ value: insight.empathy.dims, areaStyle: { color: "rgba(83,74,183,.22)" }, lineStyle: { color: "#534ab7", width: 2 }, itemStyle: { color: "#534ab7" } }] }],
  }), [insight]);
  return (
    <article className="empathy-card insight-card">
      <SectionHead eyebrow="MEASURE · 共情指数" title="5 维可解释评分" extra={<span className="empathy-total">{insight.empathy.total}</span>} />
      <EChart option={option} className="empathy-chart" label="五维共情指数雷达图" />
      <p className="coach-tip"><HeartOutlined /> {insight.empathy.improvement}</p>
    </article>
  );
}

function HarnessCard({ insight, selectedActions, onActions, onApprove, canApprove }: { insight: LumiInsight; selectedActions: string[]; onActions: (ids: string[]) => void; onApprove: () => void; canApprove: boolean }) {
  const actionIds = insight.riskSignals.length ? ["ESCALATE_PRODUCT_SAFETY", "NOTIFY_DUTY_MANAGER"] : [];
  return (
    <article className="harness-card insight-card">
      <SectionHead eyebrow="AGENT HARNESS" title="AgentLoop · 可回放执行" extra={<Tag>{insight.trace.length} 个节点</Tag>} />
      <div className="loop-strip">
        {['SENSE', 'THINK', 'ACT', 'OBSERVE', 'REFLECT'].map((step, index) => <span key={step}><i>{index + 1}</i>{step}</span>)}
      </div>
      <div className="trace-list">
        {insight.trace.map((item) => (
          <div key={`${item.node}-${item.latency}`}>
            <i className={item.state}><CheckOutlined /></i>
            <span><b>{item.node}</b><small>{item.detail}</small></span>
            <em>{item.latency} ms</em>
          </div>
        ))}
      </div>
      <div className="approval-gate">
        <div><SafetyCertificateOutlined /><span><b>人工审批门</b><small>Agent 只生成建议；副作用进入幂等 Outbox</small></span></div>
        {actionIds.map((id) => (
          <label key={id}><input type="checkbox" checked={selectedActions.includes(id)} onChange={(event) => onActions(event.target.checked ? [...selectedActions, id] : selectedActions.filter((item) => item !== id))} />{id === "ESCALATE_PRODUCT_SAFETY" ? "升级产品安全事件" : "通知值班主管"}</label>
        ))}
        <Button disabled={!canApprove || !actionIds.length || !selectedActions.length} onClick={onApprove}>批准受控动作</Button>
      </div>
    </article>
  );
}

function InsightPanel({ insight, running, activeNode, onUse, onFeedback, selectedActions, onActions, onApprove, role }: {
  insight: LumiInsight;
  running: boolean;
  activeNode: string;
  onUse: (text: string) => void;
  onFeedback: (kind: "subtext" | "prediction", verdict: "accurate" | "partially" | "inaccurate") => void;
  selectedActions: string[];
  onActions: (ids: string[]) => void;
  onApprove: () => void;
  role: LumiRole;
}) {
  return (
    <aside className="insight-panel">
      <div className="insight-topline">
        <div><LumiMark /><span><b>LumiSense Intelligence</b><small>Archaeology 回溯 → Prophet 预测 → Human 决策</small></span></div>
        <RuntimeProof insight={insight} running={running} activeNode={activeNode} />
      </div>
      <div className="insight-scroll">
        <PerceptionCard insight={insight} />
        <ArchaeologyCard insight={insight} />
        <SubtextCard insight={insight} onFeedback={(verdict) => onFeedback("subtext", verdict)} />
        <ProphetCard insight={insight} onApply={() => onUse(insight.scripts[0].text)} onFeedback={(verdict) => onFeedback("prediction", verdict)} />
        <ScriptsCard insight={insight} onUse={onUse} />
        <ProductMatchCard insight={insight} />
        <EmpathyCard insight={insight} />
        <HarnessCard insight={insight} selectedActions={selectedActions} onActions={onActions} onApprove={onApprove} canApprove={['agent_senior', 'supervisor', 'admin'].includes(role)} />
      </div>
    </aside>
  );
}

function ChallengeBar({ onRun, running }: { onRun: (input: RunInput) => void; running: boolean }) {
  const [value, setValue] = useState("消费者：用了两周一点变化都没有，上次客服说再等等。\n客服：抗老产品需要坚持使用，建议继续观察。\n消费者：上次也是这么说，你们到底解决过吗？\n客服：我可以再给您介绍一下产品功效。\n消费者：算了，我觉得就是白花钱。\n消费者：你们宣传是不是都只是话术？");
  return (
    <section className="challenge-bar">
      <div className="challenge-label"><span>JUDGE CHALLENGE · MULTI-TURN</span><b>粘贴 3 轮以上完整会话</b><small>按“消费者：/ 客服：”分行，运行时序因果诊断</small></div>
      <textarea value={value} onChange={(event) => setValue(event.target.value)} aria-label="评委多轮会话输入" />
      <Button type="primary" loading={running} icon={<ThunderboltFilled />} onClick={() => onRun({ conversation_id: `judge_${Date.now()}`, customer_id: "judge_consumer", text: value })}>运行时序诊断</Button>
    </section>
  );
}

function Workspace({ role }: { role: LumiRole }) {
  const [scenarioKey, setScenarioKey] = useState<LumiScenarioKey>("allergy");
  const [insight, setInsight] = useState<LumiInsight>(scenarios.allergy);
  const [draft, setDraft] = useState(scenarios.allergy.scripts[0].text);
  const [running, setRunning] = useState(false);
  const [activeNode, setActiveNode] = useState("");
  const [notice, setNotice] = useState("");
  const [liveCaseId, setLiveCaseId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState("demo_001");
  const [selectedActions, setSelectedActions] = useState<string[]>([]);

  const selectScenario = (key: Exclude<LumiScenarioKey, "challenge">) => {
    setScenarioKey(key);
    setInsight(scenarios[key]);
    setDraft(scenarios[key].scripts[0].text);
    setNotice("");
    setLiveCaseId(null);
    setConversationId(scenarioInputs[key].conversation_id);
    setSelectedActions([]);
  };

  const run = async (input: RunInput) => {
    setRunning(true);
    setActiveNode("Sense · 接收并脱敏");
    setNotice("");
    setScenarioKey("challenge");
    setConversationId(input.conversation_id);
    setInsight(insightFromRun(input));
    try {
      if (!CAREPULSE_API_ENABLED) throw new Error("demo");
      const result = await startRun(input, (node) => setActiveNode(node));
      const next = insightFromRun(input, result);
      setInsight(next);
      setDraft(next.scripts[0].text);
      setLiveCaseId(result.case_id);
      setSelectedActions(result.copilot.recommended_actions.map((item) => item.action));
      setNotice(result.review.approved ? "完整 Harness 运行完成，建议已通过独立审查。" : "审查未通过，已转人工复核且不会执行任何动作。");
    } catch {
      const fallback = insightFromRun(input);
      setInsight(fallback);
      setDraft(fallback.scripts[0].text);
      setNotice("在线运行暂不可用，当前展示确定性安全回退；不会伪装成实时模型结果。");
    } finally {
      setRunning(false);
      setActiveNode("");
    }
  };

  const approve = async () => {
    if (!liveCaseId) {
      setNotice("当前是演示数据；受控动作只在真实 Harness case 中进入 Outbox。");
      return;
    }
    try {
      await approveCase(liveCaseId, "ACCEPT", "", selectedActions);
      setNotice("受控动作已由人工批准并写入幂等 Outbox。外部适配器仍保持关闭。 ");
    } catch {
      setNotice("审批未执行：当前角色、案例状态或动作权限未满足。 ");
    }
  };

  const recordFeedback = async (
    kind: "subtext" | "prediction",
    verdict: "accurate" | "partially" | "inaccurate",
  ) => {
    try {
      const result = await submitLumiSenseFeedback({
        conversationId,
        kind,
        verdict,
        detail:
          verdict === "accurate"
            ? "客服确认输出可用"
            : "客服要求进入 bad case 人工复核",
      });
      setNotice(
        result.data.training_status === "VERIFIED"
          ? "反馈已记录并写入审计日志。"
          : "反馈已进入 bad case 人工复核队列，并写入审计日志。",
      );
    } catch {
      setNotice("反馈暂未写入在线数据集，请检查当前登录角色或后端连接。");
    }
  };

  if (role === "viewer") {
    return <RoleGate role={role} allow={['agent_junior', 'agent_senior', 'supervisor', 'admin']}><span /></RoleGate>;
  }

  return (
    <main className="workspace-view">
      <ChallengeBar onRun={run} running={running} />
      {notice && <div className="global-notice"><CheckCircleFilled />{notice}<button onClick={() => setNotice("")}>×</button></div>}
      <div className="workspace-grid">
        <ConversationRail active={scenarioKey} onSelect={selectScenario} />
        <ChatStage insight={insight} draft={draft} onDraft={setDraft} role={role} onSend={() => setNotice("回复已由人工确认。Demo 环境不连接真实消费者渠道。 ")} />
        <InsightPanel insight={insight} running={running} activeNode={activeNode} onUse={(text) => { setDraft(text); setNotice("建议已填入人工编辑区，发送前仍可修改。 "); }} onFeedback={(kind, verdict) => void recordFeedback(kind, verdict)} selectedActions={selectedActions} onActions={setSelectedActions} onApprove={approve} role={role} />
      </div>
      {scenarioKey !== "challenge" && (
        <button className="rerun-fab" onClick={() => void run(scenarioInputs[scenarioKey])} disabled={running}><ReloadOutlined /> 用真实 Harness 重跑此场景</button>
      )}
    </main>
  );
}

function RiskDashboard({ role }: { role: LumiRole }) {
  const allowed = ['viewer', 'supervisor', 'admin'].includes(role);
  const masked = role === 'viewer';
  const radarOption = useMemo<EChartsOption>(() => ({
    radar: { indicator: riskMetrics.map((item) => ({ name: item.label, max: item.label === "高危响应" ? 120 : 100 })), radius: "65%", splitNumber: 4, axisName: { color: "#504b63", fontSize: 11 }, splitArea: { areaStyle: { color: ["#fbfafc", "#f3f0fa"] } }, splitLine: { lineStyle: { color: "#ddd8ed" } }, axisLine: { lineStyle: { color: "#ddd8ed" } } },
    series: [{ type: "radar", data: [{ value: riskMetrics.map((item) => item.value), areaStyle: { color: "rgba(83,74,183,.2)" }, lineStyle: { color: "#534ab7", width: 2 }, itemStyle: { color: "#534ab7" } }] }],
  }), []);

  if (!allowed) return <main className="locked-view"><RoleGate role={role} allow={['viewer', 'supervisor', 'admin']}><span /></RoleGate></main>;

  return (
    <main className="dashboard-view page-shell">
      <section className="page-hero risk-hero">
        <div><span className="eyebrow">FORCED OUTPUT 02 · REAL-TIME RISK</span><h1>风险异常预警看板</h1><p>从被动接诉升级为前置感知：看风险、看团队、看共情如何转化为业务结果。</p></div>
        <div className="live-clock"><span /><b>实时</b><small>5 秒刷新 · 最近 21:00:05</small></div>
      </section>

      <section className="kpi-strip">
        {riskMetrics.map((item) => <div key={item.label}><span>{item.label}</span><b>{item.display}</b><em className={item.tone}>{item.tone === 'green' ? '● 正常' : '● 关注'}</em></div>)}
      </section>

      <section className="dashboard-grid primary">
        <article className="dashboard-card radar-board">
          <SectionHead eyebrow="5-D RISK RADAR" title="全局风险雷达" extra={<Tag color="green">4 正常 · 1 关注</Tag>} />
          <EChart option={radarOption} className="risk-radar-chart" label="五维风险雷达图" />
          <div className="threshold-note"><SafetyCertificateOutlined /> 红线阈值已由 AI 管理员锁定，主管仅可处置事件。</div>
        </article>
        <article className="dashboard-card alert-board">
          <SectionHead eyebrow="ALERT STREAM" title="滚动告警流" extra={<Badge count={30} color="#a32d2d" />} />
          <div className="alert-stream">
            {riskAlerts.map((alert) => (
              <div key={alert.id} className={`alert-item ${alert.level}`}>
                <i>{alert.level === 'red' ? <WarningFilled /> : <AlertOutlined />}</i>
                <span><b>{alert.title}</b><small>{masked ? '会话 **** · 数据已脱敏' : alert.detail} · {alert.time}</small></span>
                {!masked && <Button size="small">{alert.action}</Button>}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="dashboard-grid secondary">
        <article className="dashboard-card team-board">
          <SectionHead eyebrow="TEAM EMPATHY" title="团队共情分布" extra={!masked && <Button size="small" icon={<TeamOutlined />}>派发培训</Button>} />
          <div className="ranking-list">
            {teamRanking.map((member, index) => (
              <div key={member.id}><span className="rank">{index + 1}</span><Avatar size={30}>{masked ? '*' : member.name.slice(0, 1)}</Avatar><span><b>{masked ? `坐席 ${member.id}` : member.name}<small>{member.fatigue === 'exhausted' ? '疲劳预警' : member.fatigue === 'tired' ? '建议关注' : '状态稳定'}</small></b></span><strong>{member.score}</strong><em className={member.trend.startsWith('-') ? 'down' : 'up'}>{member.trend}</em></div>
            ))}
          </div>
        </article>
        <article className="dashboard-card funnel-board">
          <SectionHead eyebrow="EMPATHY TO GMV" title="共情转化漏斗" extra={<Tag color="green">转化 18.3%</Tag>} />
          <div className="funnel">
            {[['推荐触达', 120, 100], ['继续咨询', 68, 72], ['加入购物车', 35, 48], ['完成下单', 22, 31]].map(([label, value, width]) => <div key={String(label)} style={{ '--funnel-width': `${width}%` } as React.CSSProperties}><span>{label}</span><b>{value}</b></div>)}
          </div>
          <p>深度共情路径的推荐咨询率比固定模板高 <b>+40pp</b>（Demo 假设，待真实 A/B 验证）。</p>
        </article>
        <article className="dashboard-card fatigue-board">
          <SectionHead eyebrow="AGENT WELLBEING" title="坐席疲劳预警" />
          <div className="fatigue-score"><span>连续高危 case</span><b>11</b><Progress percent={78} showInfo={false} strokeColor="#ba7517" /></div>
          <p>坐席 #008 最近 10 句语言温度从 52 降至 38，建议 15 分钟内换班。</p>
          {!masked && <Button block>创建换班建议</Button>}
        </article>
      </section>
    </main>
  );
}

function GrowthView({ role }: { role: LumiRole }) {
  const radarOption = useMemo<EChartsOption>(() => ({
    radar: { indicator: ['情绪识别', '痛点回应', '方案有效', '语言温度', '品牌契合'].map((name) => ({ name, max: 100 })), radius: '67%', axisName: { color: '#504b63' }, splitArea: { areaStyle: { color: ['#faf9fd', '#f4f1fb'] } }, splitLine: { lineStyle: { color: '#ddd8ed' } }, axisLine: { lineStyle: { color: '#ddd8ed' } } },
    series: [{ type: 'radar', data: [{ name: '本周', value: [91, 86, 82, 76, 88], areaStyle: { color: 'rgba(15,110,86,.22)' }, lineStyle: { color: '#0f6e56', width: 2 }, itemStyle: { color: '#0f6e56' } }, { name: '团队均值', value: [78, 74, 79, 71, 80], lineStyle: { color: '#aaa3bd', type: 'dashed' }, itemStyle: { color: '#aaa3bd' } }] }],
  }), []);
  const curveOption = useMemo<EChartsOption>(() => ({
    grid: { left: 35, right: 15, top: 25, bottom: 28 },
    xAxis: { type: 'category', data: ['周一', '周二', '周三', '周四', '周五', '周六', '今天'], boundaryGap: false, axisLine: { lineStyle: { color: '#ded9ea' } } },
    yAxis: { type: 'value', min: 50, max: 100, splitLine: { lineStyle: { color: '#efedf5' } } },
    series: [{ type: 'line', data: [68, 72, 75, 74, 80, 83, 85], smooth: true, areaStyle: { color: 'rgba(83,74,183,.12)' }, lineStyle: { color: '#534ab7', width: 3 }, itemStyle: { color: '#534ab7' } }],
  }), []);
  const selfOnly = !['supervisor', 'admin'].includes(role);
  return (
    <main className="growth-view page-shell">
      <section className="page-hero growth-hero"><div><span className="eyebrow">MEASURE · EMPATHY COACH</span><h1>{selfOnly ? '我的共情成长' : '团队共情教练'}</h1><p>不是给客服打一个黑盒分数，而是把每一次“被看见”拆成可学习、可复盘的五个维度。</p></div><div className="hero-score"><b>85</b><span>本周综合分<small>团队排名 3 / 18</small></span></div></section>
      <section className="growth-grid">
        <article className="dashboard-card"><SectionHead eyebrow="5-D EMPATHY" title="本周能力雷达" extra={<Tag color="green">+7 分</Tag>} /><EChart option={radarOption} className="growth-radar" label="个人共情能力雷达图" /><div className="legend-line"><span><i className="mine" />本周</span><span><i />团队均值</span></div></article>
        <article className="dashboard-card curve-card"><SectionHead eyebrow="GROWTH CURVE" title="7 日成长曲线" extra={<Tag>42 条已评分回复</Tag>} /><EChart option={curveOption} className="growth-curve" label="七日共情成长曲线" /><div className="coach-callout"><HeartOutlined /><span><b>本周最值得保持</b><p>你开始先命名消费者的处境，再解释方案。情绪识别维度提升了 13 分。</p></span></div></article>
        <article className="dashboard-card coaching-card"><SectionHead eyebrow="NEXT BEST PRACTICE" title="下一条就能用的改进" /><div className="before-after"><span>原句</span><p>“不好意思给您带来不便，这边帮您反馈一下。”</p><ArrowRightOutlined /><span>建议改写</span><p>“同一个问题让您第三次来联系我们，确实很消耗耐心。我已经找到前两次记录，不需要您再重复说明。”</p></div><Button type="primary">加入个人话术练习</Button></article>
      </section>
    </main>
  );
}

function EvolutionView({ role }: { role: LumiRole }) {
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [brand, setBrand] = useState("lancome");
  const [keywords, setKeywords] = useState("优雅, 法式, 女性力量");
  const [brandStyle, setBrandStyle] = useState("精致、有温度");
  const [forbiddenWords, setForbiddenWords] = useState("亲, 宝宝, 家人们");
  const [configNotice, setConfigNotice] = useState("");
  useEffect(() => { void getEvaluationReport().then(setReport).catch(() => undefined); }, []);
  if (!['supervisor', 'admin'].includes(role)) return <main className="locked-view"><RoleGate role={role} allow={['supervisor', 'admin']}><span /></RoleGate></main>;
  return (
    <main className="evolution-view page-shell">
      <section className="page-hero evolution-hero"><div><span className="eyebrow">SELF-EVOLUTION · HUMAN GOVERNED</span><h1>让每个 bad case 变成下一版能力</h1><p>Rubric 评测 → 人工复核 → 训练数据 → A/B 验证。Demo 展示闭环，不宣称已完成真实 SFT 或 Agentic RL。</p></div><Tag color="purple">V2.0 DATA FLYWHEEL</Tag></section>
      <section className="flywheel">
        {[['01', '交互数据', '会话、采纳、编辑与结果'], ['02', 'Rubric 评测', 'P0 硬规则 + P1/P2 质量'], ['03', '人工复核', '翻译错误、误报与不安全推荐'], ['04', '训练候选', 'SFT 数据集与版本评估']].map((item, index) => <div key={item[0]}><span>{item[0]}</span><b>{item[1]}</b><p>{item[2]}</p>{index < 3 && <ArrowRightOutlined />}</div>)}
      </section>
      <section className="evolution-grid">
        <article className="dashboard-card cold-start-card"><SectionHead eyebrow="COLD START FACTORY" title="无需真实数据也能完整演示" extra={<Tag color="green">READY</Tag>} /><div className="cold-stats">{coldStartStats.map((item) => <div key={item.label}><b>{item.value}</b><span>{item.label}</span></div>)}</div><p>覆盖 12 类美妆场景、5 类情绪拐点、50+ 成分规则和 7 个子品牌人设。所有人物与指标均为匿名化伪数据。</p></article>
        <article className="dashboard-card eval-card"><SectionHead eyebrow="ENGINEERING EVAL" title="60 条回归证据" extra={<Tag>{report ? `${report.methodology.cases} CASES` : 'LOADING'}</Tag>} /><div className="eval-metrics">{(report?.metrics ?? [{ key: 'risk', label: '高风险召回率', carepulse: 100, target: '100%' }, { key: 'citation', label: '证据引用有效率', carepulse: 100, target: '≥95%' }, { key: 'safe', label: '证据缺失安全失败', carepulse: 100, target: '100%' }]).slice(0, 5).map((metric) => <div key={metric.key}><span>{metric.label}</span><b>{metric.carepulse}%</b><Progress percent={metric.carepulse} showInfo={false} strokeColor="#0f6e56" /><em>目标 {metric.target}</em></div>)}</div><small>工程回归不等于欧莱雅真实业务 A/B；接入真实数据后需补盲测。</small></article>
        <article className="dashboard-card badcase-card"><SectionHead eyebrow="BAD CASE QUEUE" title="待复核训练候选" extra={<Badge count={12} color="#ba7517" />} /><div className="badcase-list">{[['翻译错误', '“没事没事”被误判为中性', '高'], ['不安全推荐', '孕期场景出现视黄醇 SKU', '严重'], ['预警误报', '“包装红色”触发红肿规则', '中'], ['品牌偏差', '兰蔻话术出现“亲亲”', '中']].map((item) => <div key={item[1]}><Tag color={item[2] === '严重' ? 'red' : 'gold'}>{item[2]}</Tag><span><b>{item[0]}</b><small>{item[1]}</small></span><Button size="small">复核</Button></div>)}</div></article>
        <article className="dashboard-card rbac-card"><SectionHead eyebrow="RBAC · AUDIT" title="五级权限矩阵" extra={<Tag>{roleProfiles[role].level} 当前视图</Tag>} /><div className="permission-table"><div className="permission-row header"><span>能力</span>{(['viewer', 'agent_junior', 'agent_senior', 'supervisor', 'admin'] as LumiRole[]).map((item) => <b key={item}>{roleProfiles[item].level}</b>)}</div>{permissionMatrix.map((row) => <div className="permission-row" key={row.capability}><span>{row.capability}</span>{(['viewer', 'agent_junior', 'agent_senior', 'supervisor', 'admin'] as LumiRole[]).map((item) => <b key={item} className={row[item] ? 'yes' : 'no'}>{row[item] ? '✓' : '—'}</b>)}</div>)}</div></article>
        <article className="dashboard-card admin-config-card"><SectionHead eyebrow="ADMIN · BRAND PERSONA" title="品牌人设配置" extra={<Tag color={role === 'admin' ? 'purple' : 'default'}>{role === 'admin' ? '可编辑' : '主管只读'}</Tag>} /><label><span>品牌</span><Select value={brand} disabled={role !== 'admin'} onChange={setBrand} options={[['lancome', 'Lancôme 兰蔻'], ['loreal', "L'Oréal Paris 巴黎欧莱雅"], ['lrp', 'La Roche-Posay 理肤泉'], ['ysl', 'YSL 圣罗兰'], ['kiehls', "Kiehl's 科颜氏"], ['shu', 'Shu Uemura 植村秀'], ['maybelline', 'Maybelline 美宝莲']].map(([value, label]) => ({ value, label }))} /></label><label><span>人设关键词</span><input value={keywords} disabled={role !== 'admin'} onChange={(event) => setKeywords(event.target.value)} /></label><label><span>沟通风格</span><input value={brandStyle} disabled={role !== 'admin'} onChange={(event) => setBrandStyle(event.target.value)} /></label><label><span>禁用词</span><input value={forbiddenWords} disabled={role !== 'admin'} onChange={(event) => setForbiddenWords(event.target.value)} /></label><div className="config-actions"><small>{configNotice || '保存后写入配置表与审计日志；真实受信身份仍需具备 ADMIN。'}</small><Button type="primary" disabled={role !== 'admin'} onClick={() => void updateBrandPersona({ brand, keywords: keywords.split(',').map((item) => item.trim()).filter(Boolean), style: brandStyle, forbiddenWords: forbiddenWords.split(',').map((item) => item.trim()).filter(Boolean) }).then(() => setConfigNotice('品牌人设已更新并同步记录审计。')).catch(() => setConfigNotice('演示身份已切换，但当前受信服务端身份不是 ADMIN，未写入配置。'))}>保存并同步 Agent</Button></div></article>
        <article className="dashboard-card knowledge-card"><SectionHead eyebrow="BEAUTY KNOWLEDGE" title="行业知识图谱" /><div className="knowledge-layers">{[['L1', '12 类品类', '护肤 · 彩妆 · 个护'], ['L2', '6 类肤质', '中性 · 干油混合 · 敏感 · 痘肌'], ['L3', '50+ 成分', '活性 · 风险 · 修护 · 禁忌替代'], ['L4', '20+ 场景', '不良反应 · 选品 · 物流 · 权益'], ['L5', '5 类拐点', '恐慌 · 失望 · 焦虑 · 不满 · 怀疑']].map((item) => <div key={item[0]}><span>{item[0]}</span><b>{item[1]}</b><small>{item[2]}</small></div>)}</div></article>
        <article className="dashboard-card roadmap-card"><SectionHead eyebrow="ROADMAP" title="从 Demo 到规模化" /><div className="roadmap-list">{[['48h', '黑客松 Demo', 'P0 全链路可演示'], ['Month 1', '可试用 MVP', 'RBAC、审计、真实知识接入'], ['Month 2', '数据闭环', 'bad case 与 SFT 数据集'], ['Month 3', '规模化验证', 'A/B 与模型迭代']].map((item, index) => <div key={item[0]} className={index === 0 ? 'active' : ''}><span>{item[0]}</span><b>{item[1]}</b><small>{item[2]}</small></div>)}</div></article>
      </section>
    </main>
  );
}

export default function Home() {
  const [role, setRole] = useState<LumiRole>("agent_senior");
  const [view, setView] = useState<LumiView>("workspace");
  const profile = roleProfiles[role];

  const changeRole = (next: LumiRole) => {
    setRole(next);
    if (!roleViews[next].includes(view)) setView(roleViews[next][0]);
  };

  return (
    <ConfigProvider theme={{ token: { colorPrimary: "#534ab7", colorSuccess: "#0f6e56", colorWarning: "#ba7517", colorError: "#a32d2d", borderRadius: 10, fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif' }, components: { Button: { fontWeight: 650, controlHeight: 36 }, Tag: { borderRadiusSM: 6 } } }}>
      <div className="lumisense-app">
        <header className="app-header">
          <div className="brand-lockup"><LumiMark /><div><strong>LumiSense <em>感光</em></strong><span>欧莱雅美妆 AI 共情管家</span></div><Tag>V2.0</Tag></div>
          <nav className="primary-nav" aria-label="产品主导航">
            {(Object.keys(viewLabels) as LumiView[]).map((key) => {
              const allowed = roleViews[role].includes(key);
              return <Tooltip key={key} title={allowed ? '' : `${profile.label}无此页面权限`}><button className={view === key ? 'active' : ''} disabled={!allowed} onClick={() => setView(key)}>{viewLabels[key].icon}<span>{viewLabels[key].label}</span>{!allowed && <LockOutlined />}</button></Tooltip>;
            })}
          </nav>
          <div className="header-actions">
            <div className="north-star"><span>北极星</span><b>AI-Assisted FCR</b><em>目标 +15pp</em></div>
            <Select value={role} onChange={changeRole} popupMatchSelectWidth={250} className="role-select" options={(Object.keys(roleProfiles) as LumiRole[]).map((key) => ({ value: key, label: `${roleProfiles[key].name} · ${roleProfiles[key].label} ${roleProfiles[key].level}` }))} />
            <div className="active-user"><Avatar size={34} icon={<UserOutlined />} /><span><b>{profile.name}</b><small>{profile.label} · {profile.level}</small></span></div>
          </div>
        </header>
        <div className="philosophy-rail"><span className="active"><i>01</i>SENSE 感知</span><ArrowRightOutlined /><span><i>02</i>RESPOND 回应</span><ArrowRightOutlined /><span><i>03</i>RESOLVE 解决</span><ArrowRightOutlined /><span><i>04</i>MEASURE 衡量</span><em>共情不是话术，是可验证的工作流</em></div>
        {view === 'workspace' ? <Workspace role={role} /> : view === 'risk' ? <RiskDashboard role={role} /> : view === 'growth' ? <GrowthView role={role} /> : <EvolutionView role={role} />}
      </div>
    </ConfigProvider>
  );
}
