"use client";

import {
  ArrowRightOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  HeartOutlined,
  LockOutlined,
  MessageOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Avatar,
  ConfigProvider,
  Select,
  Tag,
  Tooltip,
} from "antd";
import { useState } from "react";
import LumiMark from "../../components/LumiMark";
import EvolutionView from "../evolution/components/EvolutionView";
import GrowthView from "../growth/components/GrowthView";
import RiskDashboard from "../risk/components/RiskDashboard";
import Workspace from "../workbench/components/Workspace";
import {
  roleProfiles,
  roleViews,
  type LumiRole,
  type LumiView,
} from "../demo/domain/lumisense-demo";


const viewLabels: Record<LumiView, { label: string; icon: React.ReactNode }> = {
  workspace: { label: "智能接待", icon: <MessageOutlined /> },
  risk: { label: "风险预警", icon: <DashboardOutlined /> },
  growth: { label: "共情成长", icon: <HeartOutlined /> },
  evolution: { label: "进化中心", icon: <ExperimentOutlined /> },
};









export default function Home() {
  const [role, setRole] = useState<LumiRole>("agent_senior");
  const [view, setView] = useState<LumiView>("workspace");
  const profile = roleProfiles[role];

  const changeRole = (next: LumiRole) => {
    setRole(next);
    if (!roleViews[next].includes(view)) setView(roleViews[next][0]);
  };

  return (
    <ConfigProvider theme={{ token: { colorPrimary: "#534ab7", colorSuccess: "#0f6e56", colorWarning: "#ba7517", colorError: "#a32d2d", borderRadius: 10, fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif' }, components: { Button: { fontWeight: 650, controlHeight: 36 }, Tag: { borderRadiusSM: 6 } } }}>
      <div className="lumisense-app">
        <header className="app-header">
          <div className="brand-lockup"><LumiMark /><div><strong>LumiSense <em>感光</em></strong><span>欧莱雅美妆 AI 共情管家</span></div><Tag>V2.0</Tag></div>
          <nav className="primary-nav" aria-label="产品主导航">
            {(Object.keys(viewLabels) as LumiView[]).map((key) => {
              const allowed = roleViews[role].includes(key);
              return <Tooltip key={key} title={allowed ? '' : `${profile.label}无此页面权限`}><button className={view === key ? 'active' : ''} disabled={!allowed} onClick={() => setView(key)}>{viewLabels[key].icon}<span>{viewLabels[key].label}</span>{!allowed && <LockOutlined />}</button></Tooltip>;
            })}
          </nav>
          <div className="header-actions">
            <div className="north-star"><span>北极星</span><b>AI-Assisted FCR</b><em>目标 +15pp</em></div>
            <Select value={role} onChange={changeRole} popupMatchSelectWidth={250} className="role-select" options={(Object.keys(roleProfiles) as LumiRole[]).map((key) => ({ value: key, label: `${roleProfiles[key].name} · ${roleProfiles[key].label} ${roleProfiles[key].level}` }))} />
            <div className="active-user"><Avatar size={34} icon={<UserOutlined />} /><span><b>{profile.name}</b><small>{profile.label} · {profile.level}</small></span></div>
          </div>
        </header>
        <div className="philosophy-rail"><span className="active"><i>01</i>SENSE 感知</span><ArrowRightOutlined /><span><i>02</i>RESPOND 回应</span><ArrowRightOutlined /><span><i>03</i>RESOLVE 解决</span><ArrowRightOutlined /><span><i>04</i>MEASURE 衡量</span><em>共情不是话术，是可验证的工作流</em></div>
        {view === 'workspace' ? <Workspace role={role} /> : view === 'risk' ? <RiskDashboard role={role} /> : view === 'growth' ? <GrowthView role={role} /> : <EvolutionView role={role} />}
      </div>
    </ConfigProvider>
  );
}
