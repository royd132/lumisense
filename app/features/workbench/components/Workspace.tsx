"use client";

import { CheckCircleFilled, ReloadOutlined } from "@ant-design/icons";
import RoleGate from "../../../components/RoleGate";
import { scenarioInputs, type LumiRole } from "../../demo/domain/lumisense-demo";
import { useWorkbenchController } from "../hooks/useWorkbenchController";
import ChallengeBar from "./ChallengeBar";
import ChatStage from "./ChatStage";
import ConversationRail from "./ConversationRail";
import InsightPanel from "./InsightPanel";

export default function Workspace({ role }: { role: LumiRole }) {
  const controller = useWorkbenchController();

  if (role === "viewer") {
    return <RoleGate role={role} allow={['agent_junior', 'agent_senior', 'supervisor', 'admin']}><span /></RoleGate>;
  }

  return (
    <main className="workspace-view">
      <ChallengeBar onRun={controller.run} running={controller.running} />
      {controller.notice && <div className="global-notice"><CheckCircleFilled />{controller.notice}<button onClick={controller.clearNotice}>×</button></div>}
      <div className="workspace-grid">
        <ConversationRail active={controller.scenarioKey} onSelect={controller.selectScenario} />
        <ChatStage insight={controller.insight} draft={controller.draft} onDraft={controller.setDraft} role={role} onSend={() => controller.setNotice("回复已由人工确认。Demo 环境不连接真实消费者渠道。 ")} />
        <InsightPanel
          insight={controller.insight}
          running={controller.running}
          activeNode={controller.activeNode}
          onUse={(text) => {
            controller.setDraft(text);
            controller.setNotice("建议已填入人工编辑区，发送前仍可修改。 ");
          }}
          onFeedback={(kind, verdict) => void controller.recordFeedback(kind, verdict)}
          selectedActions={controller.selectedActions}
          onActions={controller.setSelectedActions}
          onApprove={controller.approve}
          role={role}
        />
      </div>
      {controller.scenarioKey !== "challenge" && (
        <button
          className="rerun-fab"
          title="将当前预设场景提交给在线 Edge Harness，并生成新的可审计运行记录"
          onClick={() => void controller.run(scenarioInputs[controller.scenarioKey])}
          disabled={controller.running}
        >
          <ReloadOutlined /> 提交当前场景到在线 Harness
        </button>
      )}
    </main>
  );
}
