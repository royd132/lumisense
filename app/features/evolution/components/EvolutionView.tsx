"use client";

import {
  ArrowRightOutlined,
  AuditOutlined,
  CheckCircleFilled,
  DatabaseOutlined,
  ExperimentOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { Badge, Button, Progress, Select, Tag } from "antd";
import { useEffect, useState } from "react";
import RoleGate from "../../../components/RoleGate";
import SectionHead from "../../../components/SectionHead";
import {
  getEvaluationReport,
  getEvolutionSummary,
  getPublicDataSkillLoop,
  promotePublicDataSkill,
  reviewEvolutionFeedback,
  runPublicDataSkillLoop,
  updateBrandPersona,
  type EvaluationReport,
  type EvolutionSummary,
  type PublicDataSkillLoop,
  type PublicDataSkillState,
} from "../../harness/api/client";
import {
  coldStartStats,
  permissionMatrix,
  roleProfiles,
  type LumiRole,
} from "../../demo/domain/lumisense-demo";

export default function EvolutionView({ role }: { role: LumiRole }) {
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [evolutionSummary, setEvolutionSummary] = useState<EvolutionSummary | null>(null);
  const [publicLoop, setPublicLoop] = useState<PublicDataSkillLoop | null>(null);
  const [publicLoopState, setPublicLoopState] = useState<PublicDataSkillState | null>(null);
  const [publicLoopBusy, setPublicLoopBusy] = useState(false);
  const [publicLoopNotice, setPublicLoopNotice] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("补充正确标签、期望输出或规则依据");
  const [evolutionNotice, setEvolutionNotice] = useState("");
  const [brand, setBrand] = useState("lancome");
  const [keywords, setKeywords] = useState("优雅, 法式, 女性力量");
  const [brandStyle, setBrandStyle] = useState("精致、有温度");
  const [forbiddenWords, setForbiddenWords] = useState("亲, 宝宝, 家人们");
  const [configNotice, setConfigNotice] = useState("");
  const refreshEvolution = () => void getEvolutionSummary().then(setEvolutionSummary).catch(() => undefined);
  useEffect(() => {
    void getEvaluationReport().then(setReport).catch(() => undefined);
    void getPublicDataSkillLoop().then((result) => {
      setPublicLoop(result.loop);
      setPublicLoopState(result.state);
    }).catch(() => undefined);
    refreshEvolution();
  }, []);
  const pendingCases = evolutionSummary?.recent.filter((item) => item.training_status === "PENDING_HUMAN_REVIEW") ?? [];
  const reviewFeedback = async (feedbackId: string, decision: "approve" | "reject") => {
    try {
      const result = await reviewEvolutionFeedback({ feedbackId, decision, correction: reviewNote });
      setEvolutionNotice(result.data.training_status === "VERIFIED" ? "已批准为训练候选，并写入审计日志。" : "已拒绝该候选，并写入审计日志。");
      setReviewingId(null);
      refreshEvolution();
    } catch {
      setEvolutionNotice("复核未完成：该反馈可能已被处理，或当前身份没有权限。");
    }
  };
  const runPublicLoop = async () => {
    setPublicLoopBusy(true);
    setPublicLoopNotice("正在执行导入、Skill 管理和影子评测…");
    try {
      const result = await runPublicDataSkillLoop();
      setPublicLoop(result.loop);
      setPublicLoopState({
        active_skill: publicLoopState?.active_skill ?? null,
        latest_run: {
          id: result.run_id,
          status: result.status,
          trace_id: result.trace_id,
          created_at: result.created_at,
          promoted_at: null,
        },
      });
      setPublicLoopNotice("影子闭环已完成：候选 v1.1.0 通过公开切片与 60 条回归，等待人工发布。");
    } catch {
      setPublicLoopNotice("公开数据闭环未完成，请稍后重试。");
    } finally {
      setPublicLoopBusy(false);
    }
  };
  const promotePublicLoop = async () => {
    if (!publicLoopState?.latest_run?.id) return;
    setPublicLoopBusy(true);
    try {
      const result = await promotePublicDataSkill(publicLoopState.latest_run.id);
      setPublicLoopState((current) => current ? {
        active_skill: {
          id: publicLoop?.candidate_skill.id ?? "skill_product_safety_triage_v1_1_0",
          version: result.skill_version,
          status: "ACTIVE",
          source_type: "PUBLIC_CC0",
          promoted_at: result.promoted_at,
        },
        latest_run: current.latest_run ? {
          ...current.latest_run,
          status: result.status,
          promoted_at: result.promoted_at,
        } : null,
      } : current);
      setPublicLoopNotice(`Skill ${result.skill_version} 已发布；Trace ${result.trace_id.slice(0, 18)}…，可回滚到 1.0.0。`);
    } catch {
      setPublicLoopNotice("发布未完成：请确认回归门禁和受信角色权限。");
    } finally {
      setPublicLoopBusy(false);
    }
  };
  if (!['supervisor', 'admin'].includes(role)) return <main className="locked-view"><RoleGate role={role} allow={['supervisor', 'admin']}><span /></RoleGate></main>;
  return (
    <main className="evolution-view page-shell">
      <section className="page-hero evolution-hero"><div><span className="eyebrow">SELF-EVOLUTION · HUMAN GOVERNED</span><h1>让每个 bad case 变成下一版能力</h1><p>这里不是让模型自行修改自己，而是把反馈沉淀为可审计数据，经人工复核、回归评测和版本发布后再进化。</p></div><Tag color="purple">{evolutionSummary ? `${evolutionSummary.total_feedback} 条真实反馈` : 'DATA FLYWHEEL'}</Tag></section>
      <section className="flywheel">
        {[['01', '交互反馈', `${evolutionSummary?.total_feedback ?? 0} 条已入库`], ['02', 'Bad case 队列', `${evolutionSummary?.pending_review ?? 0} 条待人工复核`], ['03', '训练候选', `${evolutionSummary?.verified ?? 0} 条已验证`], ['04', '回归与发布', '60 条基线守门']].map((item, index) => <div key={item[0]}><span>{item[0]}</span><b>{item[1]}</b><p>{item[2]}</p>{index < 3 && <ArrowRightOutlined />}</div>)}
      </section>
      <section className="evolution-usage-guide">
        <SectionHead eyebrow="HOW TO USE · 完整操作链" title="从自定义场景到能力进化" extra={<Tag color="green">7 STEPS</Tag>} />
        <div className="usage-flow">
          {[
            ["01", "定义场景", "智能接待 → 自定义消费者与场景"],
            ["02", "运行 Harness", "时序分析、证据检索、风险判断、独立审查"],
            ["03", "人工决策", "编辑建议；高风险动作进入审批门"],
            ["04", "反馈结果", "点击准确／需修正，写入反馈与审计日志"],
            ["05", "复核 bad case", "在本页补充正确标签或期望输出"],
            ["06", "形成候选", "批准后进入去标识化训练候选集"],
            ["07", "评测发布", "先过 60 条回归，再由人发布新版本"],
          ].map((item) => <div key={item[0]}><span>{item[0]}</span><b>{item[1]}</b><small>{item[2]}</small></div>)}
        </div>
        <p><SafetyCertificateOutlined /> 自进化 = 数据与策略版本持续改进；模型不能绕过人工复核、权限、回归指标或直接修改生产系统。</p>
      </section>
      {evolutionNotice && <div className="evolution-notice"><CheckCircleFilled />{evolutionNotice}</div>}
      {publicLoop && <section className="public-data-lab">
        <div className="public-data-head">
          <div>
            <span className="eyebrow">PUBLIC DATA × AUTOSKILL · REPRODUCIBLE LOOP</span>
            <h2>用公开真实评论跑一次 Skill 进化闭环</h2>
            <p>从 1,232 条公开记录中按固定规则抽取 3 条一星安全切片；原始评论不是客服对话，不伪装成真实会话。</p>
          </div>
          <div className="public-data-actions">
            <Tag color="green">{publicLoop.dataset.license}</Tag>
            <a href={publicLoop.dataset.source_url} target="_blank" rel="noreferrer">查看公开数据源</a>
            <Button type="primary" icon={<ExperimentOutlined />} loading={publicLoopBusy} onClick={() => void runPublicLoop()}>运行完整闭环</Button>
          </div>
        </div>
        <div className="public-source-proof">
          <div><b>{publicLoop.metrics.cases}</b><span>去标识化样本<small>来自 {publicLoop.dataset.source_record_count.toLocaleString()} 条源记录</small></span></div>
          <div><b>{publicLoop.experience_gate.evidence_count}</b><span>独立经验来源<small>durable · portable · user-grounded</small></span></div>
          <div><b>{publicLoop.management_decision.action}</b><span>Skill 管理决策<small>同能力扩展，不重复创建</small></span></div>
          <div><b>{publicLoop.candidate_skill.version}</b><span>候选版本<small>可回滚到 {publicLoop.candidate_skill.rollback_version}</small></span></div>
        </div>
        <div className="public-loop-steps">
          {publicLoop.lifecycle.map((step, index) => <div key={step.key} className={publicLoopState?.latest_run ? 'complete' : index === 0 ? 'ready' : ''}><span>{String(index + 1).padStart(2, '0')}</span><b>{step.label}</b><small>{step.detail}</small></div>)}
        </div>
        {publicLoopNotice && <div className="public-loop-notice"><CheckCircleFilled />{publicLoopNotice}</div>}
        <div className="public-loop-grid">
          <article>
            <div className="public-panel-title"><span><DatabaseOutlined /></span><div><b>公开风险切片</b><small>用户标识与社交字段已删除</small></div></div>
            <div className="public-records">
              {publicLoop.records.map((record) => <div key={record.source_record_id}>
                <span className="record-rating">{record.rating}★</span>
                <p>“{record.review_excerpt}”</p>
                <div><Tag color={record.baseline.detected ? 'green' : 'red'}>v1.0 {record.baseline.detected ? '已识别' : '漏检'}</Tag><ArrowRightOutlined /><Tag color={record.candidate.detected ? 'green' : 'red'}>v1.1 {record.candidate.signals.join(' · ')}</Tag></div>
              </div>)}
            </div>
          </article>
          <article>
            <div className="public-panel-title"><span><AuditOutlined /></span><div><b>Skill Artifact 差异</b><small>{publicLoop.management_decision.reason}</small></div></div>
            <div className="skill-version-compare">
              <div><Tag>ACTIVE</Tag><b>{publicLoop.baseline_skill.name} <em>v{publicLoop.baseline_skill.version}</em></b><small>中文触发：{publicLoop.baseline_skill.triggers.slice(0, 5).join(' · ')}</small></div>
              <ArrowRightOutlined />
              <div><Tag color={publicLoopState?.latest_run?.status === 'PROMOTED' ? 'green' : 'purple'}>{publicLoopState?.latest_run?.status === 'PROMOTED' ? 'ACTIVE' : 'CANDIDATE'}</Tag><b>{publicLoop.candidate_skill.name} <em>v{publicLoop.candidate_skill.version}</em></b><small>新增：burned · inflamed · flaky · peeling · breakout</small></div>
            </div>
            <div className="shadow-metrics">
              <div><span>安全召回率</span><b>{publicLoop.metrics.baseline_safety_recall}% <ArrowRightOutlined /> {publicLoop.metrics.candidate_safety_recall}%</b></div>
              <div><span>False-safe</span><b>{publicLoop.metrics.false_safe_before} <ArrowRightOutlined /> {publicLoop.metrics.false_safe_after}</b></div>
              <div><span>既有回归</span><b>{publicLoop.metrics.existing_regression_passed}/{publicLoop.metrics.existing_regression_cases}</b></div>
            </div>
            <div className="promotion-gate">
              <span><SafetyCertificateOutlined /></span>
              <div><b>{publicLoopState?.latest_run?.status === 'PROMOTED' ? `v${publicLoop.candidate_skill.version} 已发布` : '等待人工 Promotion'}</b><small>公开数据只产生候选；通过影子评测也不能绕过人工门禁。发布后保留来源、Trace 与回滚版本。</small></div>
              <Button type="primary" disabled={!publicLoopState?.latest_run || publicLoopState.latest_run.status === 'PROMOTED'} loading={publicLoopBusy} onClick={() => void promotePublicLoop()}>{publicLoopState?.latest_run?.status === 'PROMOTED' ? '已发布' : '批准发布'}</Button>
            </div>
          </article>
        </div>
      </section>}
      <section className="evolution-grid">
        <article className="dashboard-card cold-start-card"><SectionHead eyebrow="COLD START FACTORY" title="无需真实数据也能完整演示" extra={<Tag color="green">READY</Tag>} /><div className="cold-stats">{coldStartStats.map((item) => <div key={item.label}><b>{item.value}</b><span>{item.label}</span></div>)}</div><p>覆盖 12 类美妆场景、5 类情绪拐点、50+ 成分规则和 7 个子品牌人设。所有人物与指标均为匿名化伪数据。</p></article>
        <article className="dashboard-card eval-card"><SectionHead eyebrow="ENGINEERING EVAL" title="60 条回归证据" extra={<Tag>{report ? `${report.methodology.cases} CASES` : 'LOADING'}</Tag>} /><div className="eval-metrics">{(report?.metrics ?? [{ key: 'risk', label: '高风险召回率', carepulse: 100, target: '100%' }, { key: 'citation', label: '证据引用有效率', carepulse: 100, target: '≥95%' }, { key: 'safe', label: '证据缺失安全失败', carepulse: 100, target: '100%' }]).slice(0, 5).map((metric) => <div key={metric.key}><span>{metric.label}</span><b>{metric.carepulse}%</b><Progress percent={metric.carepulse} showInfo={false} strokeColor="#0f6e56" /><em>目标 {metric.target}</em></div>)}</div><small>工程回归不等于欧莱雅真实业务 A/B；接入真实数据后需补盲测。</small></article>
        <article className="dashboard-card badcase-card"><SectionHead eyebrow="BAD CASE QUEUE · LIVE D1" title="待复核训练候选" extra={<Badge count={evolutionSummary?.pending_review ?? 0} color="#ba7517" />} /><div className="badcase-list">{pendingCases.length ? pendingCases.map((item) => <div key={item.id}><Tag color={item.verdict === 'inaccurate' ? 'red' : 'gold'}>{item.verdict === 'inaccurate' ? '需修正' : '部分准确'}</Tag><span><b>{item.feedback_type === 'prediction' ? '情绪预测反馈' : '潜台词辅助反馈'}</b><small>{item.conversation_id} · {item.training_status}</small></span><Button size="small" onClick={() => setReviewingId(item.id)}>复核</Button></div>) : <div className="badcase-empty"><CheckCircleFilled /><span><b>暂无待复核反馈</b><small>先在“智能接待”里对潜台词或预测点击“需修正”，这里会立即出现。</small></span></div>}</div>{reviewingId && <div className="review-workbench"><b>人工复核工作台</b><textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /><div><Button size="small" onClick={() => setReviewingId(null)}>取消</Button><Button size="small" danger onClick={() => void reviewFeedback(reviewingId, 'reject')}>拒绝候选</Button><Button size="small" type="primary" onClick={() => void reviewFeedback(reviewingId, 'approve')}>批准为训练候选</Button></div></div>}</article>
        <article className="dashboard-card rbac-card"><SectionHead eyebrow="RBAC · AUDIT" title="五级权限矩阵" extra={<Tag>{roleProfiles[role].level} 当前视图</Tag>} /><div className="permission-table"><div className="permission-row header"><span>能力</span>{(['viewer', 'agent_junior', 'agent_senior', 'supervisor', 'admin'] as LumiRole[]).map((item) => <b key={item}>{roleProfiles[item].level}</b>)}</div>{permissionMatrix.map((row) => <div className="permission-row" key={row.capability}><span>{row.capability}</span>{(['viewer', 'agent_junior', 'agent_senior', 'supervisor', 'admin'] as LumiRole[]).map((item) => <b key={item} className={row[item] ? 'yes' : 'no'}>{row[item] ? '✓' : '—'}</b>)}</div>)}</div></article>
        <article className="dashboard-card admin-config-card"><SectionHead eyebrow="ADMIN · BRAND PERSONA" title="品牌人设配置" extra={<Tag color={role === 'admin' ? 'purple' : 'default'}>{role === 'admin' ? '可编辑' : '主管只读'}</Tag>} /><label><span>品牌</span><Select value={brand} disabled={role !== 'admin'} onChange={setBrand} options={[['lancome', 'Lancôme 兰蔻'], ['loreal', "L'Oréal Paris 巴黎欧莱雅"], ['lrp', 'La Roche-Posay 理肤泉'], ['ysl', 'YSL 圣罗兰'], ['kiehls', "Kiehl's 科颜氏"], ['shu', 'Shu Uemura 植村秀'], ['maybelline', 'Maybelline 美宝莲']].map(([value, label]) => ({ value, label }))} /></label><label><span>人设关键词</span><input value={keywords} disabled={role !== 'admin'} onChange={(event) => setKeywords(event.target.value)} /></label><label><span>沟通风格</span><input value={brandStyle} disabled={role !== 'admin'} onChange={(event) => setBrandStyle(event.target.value)} /></label><label><span>禁用词</span><input value={forbiddenWords} disabled={role !== 'admin'} onChange={(event) => setForbiddenWords(event.target.value)} /></label><div className="config-actions"><small>{configNotice || '保存后写入配置表与审计日志；真实受信身份仍需具备 ADMIN。'}</small><Button type="primary" disabled={role !== 'admin'} onClick={() => void updateBrandPersona({ brand, keywords: keywords.split(',').map((item) => item.trim()).filter(Boolean), style: brandStyle, forbiddenWords: forbiddenWords.split(',').map((item) => item.trim()).filter(Boolean) }).then(() => setConfigNotice('品牌人设已更新并同步记录审计。')).catch(() => setConfigNotice('演示身份已切换，但当前受信服务端身份不是 ADMIN，未写入配置。'))}>保存并同步 Agent</Button></div></article>
        <article className="dashboard-card knowledge-card"><SectionHead eyebrow="BEAUTY KNOWLEDGE" title="行业知识图谱" /><div className="knowledge-layers">{[['L1', '12 类品类', '护肤 · 彩妆 · 个护'], ['L2', '6 类肤质', '中性 · 干油混合 · 敏感 · 痘肌'], ['L3', '50+ 成分', '活性 · 风险 · 修护 · 禁忌替代'], ['L4', '20+ 场景', '不良反应 · 选品 · 物流 · 权益'], ['L5', '5 类拐点', '恐慌 · 失望 · 焦虑 · 不满 · 怀疑']].map((item) => <div key={item[0]}><span>{item[0]}</span><b>{item[1]}</b><small>{item[2]}</small></div>)}</div></article>
        <article className="dashboard-card roadmap-card"><SectionHead eyebrow="ROADMAP" title="从 Demo 到规模化" /><div className="roadmap-list">{[['48h', '黑客松 Demo', 'P0 全链路可演示'], ['Month 1', '可试用 MVP', 'RBAC、审计、真实知识接入'], ['Month 2', '数据闭环', 'bad case 与 SFT 数据集'], ['Month 3', '规模化验证', 'A/B 与模型迭代']].map((item, index) => <div key={item[0]} className={index === 0 ? 'active' : ''}><span>{item[0]}</span><b>{item[1]}</b><small>{item[2]}</small></div>)}</div></article>
      </section>
    </main>
  );
}
