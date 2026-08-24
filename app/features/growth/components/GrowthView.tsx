"use client";

import { ArrowRightOutlined, HeartOutlined } from "@ant-design/icons";
import { Button, Tag } from "antd";
import type { EChartsOption } from "echarts";
import { useMemo } from "react";
import EChart from "../../../components/EChart";
import SectionHead from "../../../components/SectionHead";
import type { LumiRole } from "../../demo/domain/lumisense-demo";

export default function GrowthView({ role }: { role: LumiRole }) {
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
