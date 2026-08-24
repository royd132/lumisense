"use client";

import { AuditOutlined, EyeOutlined, HeartOutlined, SendOutlined } from "@ant-design/icons";
import { Avatar, Button, Tag, Tooltip } from "antd";
import LumiMark from "../../../components/LumiMark";
import type { LumiInsight, LumiRole } from "../../demo/domain/lumisense-demo";

export default function ChatStage({
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
