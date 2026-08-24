"use client";

import { useState } from "react";
import {
  insightFromRun,
  scenarioInputs,
  scenarios,
  type LumiInsight,
  type LumiScenarioKey,
} from "../../demo/domain/lumisense-demo";
import {
  approveCase,
  CAREPULSE_API_ENABLED,
  startRun,
  submitLumiSenseFeedback,
  type RunInput,
} from "../../harness/api/client";
import type { PresetScenarioKey } from "../domain/scenario-config";

type FeedbackKind = "subtext" | "prediction";
type FeedbackVerdict = "accurate" | "partially" | "inaccurate";

export function useWorkbenchController() {
  const [scenarioKey, setScenarioKey] = useState<LumiScenarioKey>("allergy");
  const [insight, setInsight] = useState<LumiInsight>(scenarios.allergy);
  const [draft, setDraft] = useState(scenarios.allergy.scripts[0].text);
  const [running, setRunning] = useState(false);
  const [activeNode, setActiveNode] = useState("");
  const [notice, setNotice] = useState("");
  const [liveCaseId, setLiveCaseId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState("demo_001");
  const [selectedActions, setSelectedActions] = useState<string[]>([]);

  const selectScenario = (key: PresetScenarioKey) => {
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
      const result = await startRun(input, setActiveNode);
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

  const recordFeedback = async (kind: FeedbackKind, verdict: FeedbackVerdict) => {
    try {
      const result = await submitLumiSenseFeedback({
        conversationId,
        kind,
        verdict,
        detail: verdict === "accurate" ? "客服确认输出可用" : "客服要求进入 bad case 人工复核",
      });
      setNotice(result.data.training_status === "VERIFIED" ? "反馈已记录并写入审计日志。" : "反馈已进入 bad case 人工复核队列，并写入审计日志。");
    } catch {
      setNotice("反馈暂未写入在线数据集，请检查当前登录角色或后端连接。");
    }
  };

  return {
    activeNode,
    approve,
    clearNotice: () => setNotice(""),
    draft,
    insight,
    notice,
    recordFeedback,
    run,
    running,
    scenarioKey,
    selectScenario,
    selectedActions,
    setDraft,
    setNotice,
    setSelectedActions,
  };
}
