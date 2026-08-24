"use client";

import {
  AlertOutlined,
  SafetyCertificateOutlined,
  WarningFilled,
} from "@ant-design/icons";
import { Avatar, Badge, Button, Tag } from "antd";
import type { EChartsOption } from "echarts";
import type React from "react";
import { useMemo } from "react";
import EChart from "../../../components/EChart";
import RoleGate from "../../../components/RoleGate";
import SectionHead from "../../../components/SectionHead";
import {
  consumerRiskCases,
  riskAlerts,
  riskMetrics,
  riskTypeBreakdown,
  type LumiRole,
} from "../../demo/domain/lumisense-demo";

export default function RiskDashboard({ role }: { role: LumiRole }) {
  const allowed = ['viewer', 'supervisor', 'admin'].includes(role);
  const masked = role === 'viewer';
  const radarOption = useMemo<EChartsOption>(() => ({
    radar: { indicator: riskMetrics.map((item) => ({ name: item.label, max: item.max })), radius: "65%", splitNumber: 4, axisName: { color: "#504b63", fontSize: 11 }, splitArea: { areaStyle: { color: ["#fbfafc", "#f3f0fa"] } }, splitLine: { lineStyle: { color: "#ddd8ed" } }, axisLine: { lineStyle: { color: "#ddd8ed" } } },
    series: [{ type: "radar", data: [{ value: riskMetrics.map((item) => item.value), areaStyle: { color: "rgba(163,45,45,.18)" }, lineStyle: { color: "#a32d2d", width: 2 }, itemStyle: { color: "#a32d2d" } }] }],
  }), []);

  if (!allowed) return <main className="locked-view"><RoleGate role={role} allow={['viewer', 'supervisor', 'admin']}><span /></RoleGate></main>;

  return (
    <main className="dashboard-view page-shell">
      <section className="page-hero risk-hero">
        <div><span className="eyebrow">FORCED OUTPUT 02 · CONSUMER RISK</span><h1>消费者风险预警中心</h1><p>从被动接诉升级为前置识别：聚合产品安全、情绪流失、服务失信、投诉舆情与交易信任风险。</p></div>
        <div className="live-clock"><span /><b>实时</b><small>5 秒刷新 · 最近 21:00:05</small></div>
      </section>

      <section className="kpi-strip">
        {riskMetrics.map((item) => <div key={item.label}><span>{item.label}</span><b>{item.display}</b><em className={item.tone}>{item.tone === 'red' ? '● 高危' : item.tone === 'yellow' ? '● 关注' : '● 正常'}</em></div>)}
      </section>

      <section className="dashboard-grid primary">
        <article className="dashboard-card radar-board">
          <SectionHead eyebrow="5-D CONSUMER RISK" title="消费者风险态势雷达" extra={<Tag color="red">2 高危 · 3 关注</Tag>} />
          <EChart option={radarOption} className="risk-radar-chart" label="消费者五维风险雷达图" />
          <div className="threshold-note"><SafetyCertificateOutlined /> 每个维度由会话、订单、历史承诺和产品证据共同触发；模型异常时进入人工复核。</div>
        </article>
        <article className="dashboard-card alert-board">
          <SectionHead eyebrow="CONSUMER ALERT STREAM" title="消费者风险事件流" extra={<Badge count={30} color="#a32d2d" />} />
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

      <section className="dashboard-grid consumer-risk-grid">
        <article className="dashboard-card consumer-risk-board">
          <SectionHead eyebrow="PRIORITY QUEUE" title="高风险消费者处置队列" extra={<Tag color="red">4 条需人工处理</Tag>} />
          <div className="consumer-risk-list">
            {consumerRiskCases.map((item, index) => (
              <div className={`consumer-risk-row ${item.level}`} key={item.id}>
                <div className="risk-consumer"><Avatar size={34}>{masked ? '*' : item.consumer.slice(0, 1)}</Avatar><span><b>{masked ? `消费者 ${index + 1}` : item.consumer}</b><small>{item.id} · {item.type}</small></span></div>
                <div className="risk-signal"><span>风险信号</span><b>{item.signal}</b><small>{masked ? '风险证据已脱敏' : item.evidence}</small></div>
                <div className="risk-trajectory"><span>情绪轨迹</span><b>{item.trajectory}</b><small>{item.contacts} 次联系</small></div>
                <div className="risk-sla"><span>SLA</span><b>{item.sla}</b><small>{masked ? '负责人已脱敏' : item.owner}</small></div>
                <div className="risk-score"><span>风险分</span><b>{item.score}</b></div>
                {!masked && <Button size="small" type={item.level === 'red' ? 'primary' : 'default'}>{item.action}</Button>}
              </div>
            ))}
          </div>
        </article>
        <article className="dashboard-card risk-control-board">
          <SectionHead eyebrow="RISK MIX & SLA" title="风险构成与处置状态" extra={<Tag>30 ACTIVE</Tag>} />
          <div className="risk-breakdown">
            {riskTypeBreakdown.map((item) => <div key={item.label}><span><b>{item.label}</b><em>{item.count} 件 · {item.percent}%</em></span><i><u className={item.tone} style={{ '--risk-width': `${item.percent * 2.8}%` } as React.CSSProperties} /></i></div>)}
          </div>
          <div className="risk-response-summary">
            <div><span>高危 30 秒内响应</span><b>83%</b></div>
            <div><span>待主管接管</span><b>4</b></div>
            <div><span>承诺逾期未解决</span><b>7</b></div>
          </div>
          <div className="risk-principle"><SafetyCertificateOutlined /><span><b>风险不是给消费者贴标签</b><small>只基于可核验行为信号做服务升级，不进行医学诊断或人格判断。</small></span></div>
        </article>
      </section>
    </main>
  );
}
