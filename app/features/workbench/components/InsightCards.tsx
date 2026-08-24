"use client";

import {
  ArrowRightOutlined,
  CheckOutlined,
  HeartOutlined,
  HistoryOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ThunderboltFilled,
} from "@ant-design/icons";
import { Button, Progress, Tag } from "antd";
import type { EChartsOption } from "echarts";
import { useMemo } from "react";
import EChart from "../../../components/EChart";
import SectionHead from "../../../components/SectionHead";
import type { LumiInsight, LumiRole } from "../../demo/domain/lumisense-demo";

export function PerceptionCard({ insight }: { insight: LumiInsight }) {
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

export function ArchaeologyCard({ insight }: { insight: LumiInsight }) {
  const archaeology = insight.archaeology;
  const enoughEvidence = archaeology.turns.length >= 3 && archaeology.confidence >= 0.6;
  return (
    <article className="archaeology-card insight-card wow-card">
      <div className="wow-ribbon">WOW 01</div>
      <SectionHead eyebrow="EMOTION ARCHAEOLOGIST · 多轮时序因果诊断" title="情绪考古师" extra={<span className={`archaeology-confidence ${enoughEvidence ? "ready" : "insufficient"}`}>{enoughEvidence ? `诊断置信度 ${Math.round(archaeology.confidence * 100)}%` : "证据不足 · 拒绝伪因果"}</span>} />
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
          {enoughEvidence && <div className="turning-point-callout"><span>{archaeology.turningPoint.round}</span><p><b>{archaeology.turningPoint.from} → {archaeology.turningPoint.to}</b>{archaeology.turningPoint.trigger}</p></div>}
        </section>
        <section className="causal-diagnosis">
          <div className="diagnosis-block root-cause"><span>病因诊断</span><p>{archaeology.rootCause}</p></div>
          <div className="causal-chain" aria-label="会话因果链">
            {archaeology.causalChain.map((item, index) => <span key={`${item}-${index}`}>{item}{index < archaeology.causalChain.length - 1 && <ArrowRightOutlined />}</span>)}
          </div>
          <div className="diagnosis-block prescription"><span>处方建议</span><p><b>不要：</b>{archaeology.avoid}</p><p><b>要做：</b>{archaeology.prescription}</p></div>
          <div className="evidence-strip"><span>证据锚点</span>{archaeology.evidenceRounds.map((round) => <b key={round}>{round}</b>)}<em>基于整段会话回溯</em></div>
        </section>
      </div>
    </article>
  );
}

export function SubtextCard({ insight, onFeedback }: { insight: LumiInsight; onFeedback: (verdict: "accurate" | "inaccurate") => void }) {
  return (
    <article className="xray-card insight-card">
      <SectionHead eyebrow="REAL-TIME ASSIST · 单轮辅助" title="潜台词摘要" extra={<span className="confidence">辅助置信度 {Math.round(insight.subtext.confidence * 100)}%</span>} />
      <div className="xray-stack">
        <div><span>表面语义</span><p>{insight.subtext.surface}</p></div>
        <div><span>真实情绪</span><p>{insight.subtext.emotion}</p></div>
        <div className="xray-focus"><span>没说出口</span><p>“{insight.subtext.hidden}”</p></div>
        <div><span>应对方向</span><p>{insight.subtext.strategy}</p></div>
      </div>
      <div className="feedback-row"><span>辅助判断准确吗？</span><Button size="small" icon={<CheckOutlined />} onClick={() => onFeedback("accurate")}>准确</Button><Button size="small" onClick={() => onFeedback("inaccurate")}>需修正</Button></div>
    </article>
  );
}

export function ProphetCard({ insight, onApply, onFeedback }: { insight: LumiInsight; onApply: () => void; onFeedback: (verdict: "accurate" | "partially") => void }) {
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
      <div className="path-list">{insight.paths.map((path) => <div key={path.key} className={`path-row ${path.tone}`}><span>Path {path.key.toUpperCase()}</span><b>{path.label}</b><em>R7 {path.scores.at(-1)} · 挽回 {path.probability}%</em>{path.key === "c" && <Tag color="green">推荐</Tag>}</div>)}</div>
      <p className="prophet-reason"><ThunderboltFilled /> {insight.recommendationReason}</p>
      <div className="card-actions"><Button type="primary" onClick={onApply}>应用 Path C 话术</Button><Button onClick={() => onFeedback("partially")}>反馈准确度</Button></div>
    </article>
  );
}

export function ScriptsCard({ insight, onUse }: { insight: LumiInsight; onUse: (text: string) => void }) {
  return (
    <article className="scripts-card insight-card">
      <SectionHead eyebrow="RESPOND · 共情话术" title="两条可编辑建议" extra={<span className="temperature">语言温度 +19</span>} />
      <div className="script-list">{insight.scripts.map((script, index) => <button key={script.label} onClick={() => onUse(script.text)} className={index === 0 ? "recommended" : ""}><span>{script.label}<em>预计 {script.score} 分</em></span><p>{script.text}</p><b>填入回复框 <ArrowRightOutlined /></b></button>)}</div>
    </article>
  );
}

export function ProductMatchCard({ insight }: { insight: LumiInsight }) {
  return (
    <article className={`product-card insight-card ${insight.product.gated ? "is-gated" : ""}`}>
      <SectionHead eyebrow="RESOLVE · 三轴匹配" title={insight.product.name} extra={<Tag color={insight.product.gated ? "gold" : "green"}>{insight.product.price}</Tag>} />
      <div className="product-brand">{insight.product.brand}</div><p>{insight.product.reason}</p>
      <div className="ingredient-row">{insight.product.ingredients.map((item) => <span key={item}>{item}</span>)}</div>
      <dl><div><dt>备选</dt><dd>{insight.product.alternatives.join(" · ")}</dd></div><div><dt>使用建议</dt><dd>{insight.product.guide}</dd></div><div className="taboo"><dt>禁忌</dt><dd>{insight.product.taboo}</dd></div></dl>
      <div className="card-actions"><Button type="primary" disabled={insight.product.gated}>{insight.product.gated ? "等待安全复核" : "生成推荐卡"}</Button><Button>查看证据</Button></div>
    </article>
  );
}

export function EmpathyCard({ insight }: { insight: LumiInsight }) {
  const option = useMemo<EChartsOption>(() => ({
    radar: { indicator: [{ name: "情绪识别", max: 100 }, { name: "痛点回应", max: 100 }, { name: "方案有效", max: 100 }, { name: "语言温度", max: 100 }, { name: "品牌契合", max: 100 }], radius: "62%", splitNumber: 4, axisName: { color: "#5b576d", fontSize: 10 }, splitArea: { areaStyle: { color: ["#faf9fd", "#f4f1fb"] } }, axisLine: { lineStyle: { color: "#ddd8ed" } }, splitLine: { lineStyle: { color: "#ddd8ed" } } },
    series: [{ type: "radar", data: [{ value: insight.empathy.dims, areaStyle: { color: "rgba(83,74,183,.22)" }, lineStyle: { color: "#534ab7", width: 2 }, itemStyle: { color: "#534ab7" } }] }],
  }), [insight]);
  return <article className="empathy-card insight-card"><SectionHead eyebrow="MEASURE · 共情指数" title="5 维可解释评分" extra={<span className="empathy-total">{insight.empathy.total}</span>} /><EChart option={option} className="empathy-chart" label="五维共情指数雷达图" /><p className="coach-tip"><HeartOutlined /> {insight.empathy.improvement}</p></article>;
}

export function HarnessCard({ insight, selectedActions, onActions, onApprove, role }: { insight: LumiInsight; selectedActions: string[]; onActions: (ids: string[]) => void; onApprove: () => void; role: LumiRole }) {
  const actionIds = insight.riskSignals.length ? ["ESCALATE_PRODUCT_SAFETY", "NOTIFY_DUTY_MANAGER"] : [];
  const canApprove = ['agent_senior', 'supervisor', 'admin'].includes(role);
  return (
    <article className="harness-card insight-card">
      <SectionHead eyebrow="AGENT HARNESS · 不是单次 Prompt" title="AgentLoop · 可回放、可中断、可审计" extra={<Tag>{insight.trace.length} 个节点</Tag>} />
      <div className="harness-definition"><div><span>ORCHESTRATE</span><b>状态机编排</b><small>每一步有明确输入、输出与状态迁移</small></div><div><span>GUARDRAIL</span><b>证据与独立审查</b><small>缺证据、安全红线或越权即中断</small></div><div><span>EXECUTE</span><b>人工门 + Outbox</b><small>副作用必须批准，并具备幂等与重试</small></div></div>
      <div className="loop-strip">{['SENSE', 'THINK', 'ACT', 'OBSERVE', 'REFLECT'].map((step, index) => <span key={step}><i>{index + 1}</i>{step}</span>)}</div>
      <div className="trace-list">{insight.trace.map((item) => <div key={`${item.node}-${item.latency}`}><i className={item.state}><CheckOutlined /></i><span><b>{item.node}</b><small>{item.detail}</small></span><em>{item.latency} ms</em></div>)}</div>
      <div className="approval-gate">
        <div><SafetyCertificateOutlined /><span><b>人工审批门</b><small>Agent 只生成建议；副作用进入幂等 Outbox</small></span></div>
        {actionIds.map((id) => <label key={id}><input type="checkbox" checked={selectedActions.includes(id)} onChange={(event) => onActions(event.target.checked ? [...selectedActions, id] : selectedActions.filter((item) => item !== id))} />{id === "ESCALATE_PRODUCT_SAFETY" ? "升级产品安全事件" : "通知值班主管"}</label>)}
        <Button disabled={!canApprove || !actionIds.length || !selectedActions.length} onClick={onApprove}>批准受控动作</Button>
      </div>
      <p className="rerun-explainer"><ReloadOutlined />“重跑此场景”会把同一份会话、消费者、订单与产品上下文重新提交给在线 Harness，生成新的运行记录；不是刷新页面或播放预设动画。</p>
    </article>
  );
}
