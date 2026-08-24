"use client";

import { ExperimentOutlined, ThunderboltFilled, UserOutlined } from "@ant-design/icons";
import { Button, Modal } from "antd";
import { useState } from "react";
import type { RunInput } from "../../harness/api/client";
import type { PresetScenarioKey } from "../domain/scenario-config";

const initialTranscript = "消费者：用了两周一点变化都没有，上次客服说再等等。\n客服：抗老产品需要坚持使用，建议继续观察。\n消费者：上次也是这么说，你们到底解决过吗？\n客服：我可以再给您介绍一下产品功效。\n消费者：算了，我觉得就是白花钱。\n消费者：你们宣传是不是都只是话术？";

export default function ChallengeBar({ onRun, running }: { onRun: (input: RunInput) => void; running: boolean }) {
  const [value, setValue] = useState(initialTranscript);
  const [studioOpen, setStudioOpen] = useState(false);
  const [consumerName, setConsumerName] = useState("林小姐");
  const [scenarioKey, setScenarioKey] = useState<PresetScenarioKey>("expectation");
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
            <label><span>场景类型</span><select value={scenarioKey} onChange={(event) => setScenarioKey(event.target.value as PresetScenarioKey)}><option value="allergy">过敏急救</option><option value="pregnancy">孕期安全</option><option value="acne">爆痘投诉</option><option value="gift">送礼推荐</option><option value="expectation">效果落差</option></select></label>
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
