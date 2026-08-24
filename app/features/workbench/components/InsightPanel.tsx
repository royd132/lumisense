"use client";

import LumiMark from "../../../components/LumiMark";
import type { LumiInsight, LumiRole } from "../../demo/domain/lumisense-demo";
import {
  ArchaeologyCard,
  EmpathyCard,
  HarnessCard,
  PerceptionCard,
  ProductMatchCard,
  ProphetCard,
  ScriptsCard,
  SubtextCard,
} from "./InsightCards";

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

export default function InsightPanel({ insight, running, activeNode, onUse, onFeedback, selectedActions, onActions, onApprove, role }: {
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
        <HarnessCard insight={insight} selectedActions={selectedActions} onActions={onActions} onApprove={onApprove} role={role} />
      </div>
    </aside>
  );
}
