"use client";

import {
  ArrowRightOutlined,
  AuditOutlined,
  CheckCircleFilled,
  CheckOutlined,
  DatabaseOutlined,
  EyeOutlined,
  ExperimentOutlined,
  HeartOutlined,
  HistoryOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  ThunderboltFilled,
  UserOutlined,
} from "@ant-design/icons";
import {
  Avatar,
  Badge,
  Button,
  Modal,
  Progress,
  Tag,
  Tooltip,
} from "antd";
import type { EChartsOption } from "echarts";
import { useMemo, useState } from "react";
import EChart from "../../../components/EChart";
import LumiMark from "../../../components/LumiMark";
import RoleGate from "../../../components/RoleGate";
import SectionHead from "../../../components/SectionHead";
import {
  approveCase,
  CAREPULSE_API_ENABLED,
  startRun,
  submitLumiSenseFeedback,
  type RunInput,
} from "../../harness/api/client";
import {
  insightFromRun,
  scenarioInputs,
  scenarios,
  type LumiInsight,
  type LumiRole,
  type LumiScenarioKey,
} from "../../demo/domain/lumisense-demo";

const scenarioOrder: Exclude<LumiScenarioKey, "challenge">[] = [
  "allergy",
  "pregnancy",
  "acne",
  "gift",
  "expectation",
];

const scenarioMeta: Record<Exclude<LumiScenarioKey, "challenge">, { index: string; label: string; accent: string }> = {
  allergy: { index: "01", label: "过敏急救", accent: "red" },
  pregnancy: { index: "02", label: "孕期安全", accent: "amber" },
  acne: { index: "03", label: "爆痘投诉", accent: "red" },
  gift: { index: "04", label: "送礼推荐", accent: "green" },
  expectation: { index: "05", label: "效果落差", accent: "amber" },
};

function RuntimeProof({ insight, running, activeNode }: { insight: LumiInsight; running: boolean; activeNode: string }) {
  const live = insight.runtime.model_mode === "LIVE_MODEL";
  const harnessOnline = insight.runtime.harness === "EDGE_D1" && insight.runtime.fallback_reason !== "awaiting_runtime";
  const fallbackLabel = insight.runtime.fallback_reason === "api_key_not_configured"
    ? "确定性策略 · 未配置模型密钥"
    : insight.runtime.fallback_reason
      ? `确定性策略 · ${insight.runtime.fallback_reason}`
      : `${insight.runtime.harness} · ${insight.runtime.model}`;
  return (
    <div className="runtime-proof">
      <span className={`runtime-dot ${running ? "is-running" : live || harnessOnline ? "is-live" : "is-fallback"}`} />
      <div>
        <b>{running ? "HARNESS RUNNING" : live ? "LIVE MODEL + HARNESS" : harnessOnline ? "EDGE HARNESS ONLINE" : "DEMO PREVIEW"}</b>
        <small>{running ? activeNode || "正在推进状态机" : live ? `${insight.runtime.model} · 独立审查` : fallbackLabel}</small>
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
      <SectionHead eyebrow="AGENT HARNESS · 不是单次 Prompt" title="AgentLoop · 可回放、可中断、可审计" extra={<Tag>{insight.trace.length} 个节点</Tag>} />
      <div className="harness-definition">
        <div><span>ORCHESTRATE</span><b>状态机编排</b><small>每一步有明确输入、输出与状态迁移</small></div>
        <div><span>GUARDRAIL</span><b>证据与独立审查</b><small>缺证据、安全红线或越权即中断</small></div>
        <div><span>EXECUTE</span><b>人工门 + Outbox</b><small>副作用必须批准，并具备幂等与重试</small></div>
      </div>
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
      <p className="rerun-explainer"><ReloadOutlined />“重跑此场景”会把同一份会话、消费者、订单与产品上下文重新提交给在线 Harness，生成新的运行记录；不是刷新页面或播放预设动画。</p>
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
  const [studioOpen, setStudioOpen] = useState(false);
  const [consumerName, setConsumerName] = useState("林小姐");
  const [scenarioKey, setScenarioKey] = useState<Exclude<LumiScenarioKey, "challenge">>("expectation");
  const [brand, setBrand] = useState("Kiehl's 科颜氏");
  const [skinType, setSkinType] = useState("干性肌");
  const [personality, setPersonality] = useState("失望型");
  const [concern, setConcern] = useState("抗老效果不达预期");
  const [productId, setProductId] = useState("SERUM_HA30");
  const [orderId, setOrderId] = useState("");
  const [contactCount, setContactCount] = useState(2);
  const [promiseOverdue, setPromiseOverdue] = useState(true);

  const runStudio = () => {
    onRun({
      conversation_id: `studio_${Date.now()}`,
      customer_id: `custom_${consumerName.trim() || "consumer"}`,
      text: value,
      scenario_key: scenarioKey,
      consumer_name: consumerName,
      brand,
      skin_type: skinType,
      personality,
      concern,
      product_id: productId || undefined,
      order_id: orderId.trim() || undefined,
      contact_count: contactCount,
      previous_promise_overdue: promiseOverdue,
    });
    setStudioOpen(false);
  };
  return (
    <section className="challenge-bar">
      <div className="challenge-label"><span>JUDGE CHALLENGE · MULTI-TURN</span><b>粘贴 3 轮以上完整会话</b><small>按“消费者：/ 客服：”分行，运行时序因果诊断</small></div>
      <textarea value={value} onChange={(event) => setValue(event.target.value)} aria-label="评委多轮会话输入" />
      <div className="challenge-actions">
        <Button loading={running} icon={<ThunderboltFilled />} onClick={() => onRun({ conversation_id: `judge_${Date.now()}`, customer_id: "judge_consumer", text: value })}>快速运行</Button>
        <Button type="primary" icon={<UserOutlined />} onClick={() => setStudioOpen(true)}>自定义消费者与场景</Button>
      </div>
      <Modal open={studioOpen} onCancel={() => setStudioOpen(false)} footer={null} width={760} title="场景工作室 · 自定义一次完整 Harness 输入">
        <div className="scenario-studio">
          <div className="studio-intro"><ExperimentOutlined /><span><b>你定义业务上下文，Harness 负责运行</b><small>消费者画像与会话用于前台解释；订单、产品和历史承诺进入证据检索与风险规则。</small></span></div>
          <div className="studio-grid">
            <label><span>消费者称呼</span><input value={consumerName} onChange={(event) => setConsumerName(event.target.value)} /></label>
            <label><span>场景类型</span><select value={scenarioKey} onChange={(event) => setScenarioKey(event.target.value as Exclude<LumiScenarioKey, "challenge">)}><option value="allergy">过敏急救</option><option value="pregnancy">孕期安全</option><option value="acne">爆痘投诉</option><option value="gift">送礼推荐</option><option value="expectation">效果落差</option></select></label>
            <label><span>品牌</span><input value={brand} onChange={(event) => setBrand(event.target.value)} /></label>
            <label><span>肤质／状态</span><input value={skinType} onChange={(event) => setSkinType(event.target.value)} /></label>
            <label><span>消费者性格</span><input value={personality} onChange={(event) => setPersonality(event.target.value)} /></label>
            <label><span>当前关注</span><input value={concern} onChange={(event) => setConcern(event.target.value)} /></label>
            <label><span>产品证据</span><select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="SERUM_HA30">玻尿酸精华</option><option value="CREAM_B26C0719">修护面霜</option><option value="FOUNDATION_P120">粉底液</option><option value="">暂不指定</option></select></label>
            <label><span>订单号（可选）</span><input value={orderId} placeholder="例如 ORDER_2088" onChange={(event) => setOrderId(event.target.value)} /></label>
            <label><span>历史联系次数</span><input type="number" min={1} max={100} value={contactCount} onChange={(event) => setContactCount(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} /></label>
            <label className="studio-check"><input type="checkbox" checked={promiseOverdue} onChange={(event) => setPromiseOverdue(event.target.checked)} /><span>存在已超时的历史承诺</span></label>
          </div>
          <label className="studio-transcript"><span>完整会话</span><textarea value={value} onChange={(event) => setValue(event.target.value)} /></label>
          <div className="studio-footer"><span>公开演示只执行分析与反馈入队；高风险外部动作仍需受信身份审批。</span><Button type="primary" loading={running} onClick={runStudio}>创建并运行场景</Button></div>
        </div>
      </Modal>
    </section>
  );
}

export default function Workspace({ role }: { role: LumiRole }) {
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
      setNotice(
        result.review.approved
          ? result.runtime.model_mode === "LIVE_MODEL"
            ? "在线 Harness 已完成：模型推理、证据检索与独立审查全部通过。"
            : "在线 Edge Harness 已完成；当前未配置模型密钥，使用可审计的确定性策略与独立规则审查。"
          : "审查未通过，已转人工复核且不会执行任何动作。",
      );
    } catch (error) {
      const fallback = insightFromRun(input);
      setInsight(fallback);
      setDraft(fallback.scripts[0].text);
      setNotice(`在线 Harness 请求失败，已保留本地安全预览。${error instanceof Error ? `原因：${error.message.slice(0, 120)}` : ""}`);
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
        <button className="rerun-fab" title="将当前预设场景提交给在线 Edge Harness，并生成新的可审计运行记录" onClick={() => void run(scenarioInputs[scenarioKey])} disabled={running}><ReloadOutlined /> 提交当前场景到在线 Harness</button>
      )}
    </main>
  );
}
