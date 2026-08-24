"use client";

import { CheckCircleFilled, DatabaseOutlined } from "@ant-design/icons";
import { Badge } from "antd";
import { scenarios, type LumiScenarioKey } from "../../demo/domain/lumisense-demo";
import {
  scenarioMeta,
  scenarioOrder,
  type PresetScenarioKey,
} from "../domain/scenario-config";

export default function ConversationRail({
  active,
  onSelect,
}: {
  active: LumiScenarioKey;
  onSelect: (key: PresetScenarioKey) => void;
}) {
  return (
    <aside className="conversation-rail">
      <div className="rail-heading">
        <div>
          <span className="eyebrow">LIVE QUEUE</span>
          <h2>当前会话</h2>
        </div>
        <Badge count={20} overflowCount={99} color="#534ab7" />
      </div>
      <label className="search-field">
        <span>⌕</span>
        <input aria-label="搜索会话" placeholder="搜索消费者 / 场景" />
      </label>
      <div className="queue-groups">
        <span>演示必跑 · 5 个场景</span>
        {scenarioOrder.map((key) => {
          const item = scenarios[key];
          const meta = scenarioMeta[key];
          return (
            <button
              key={key}
              className={`conversation-item ${active === key ? "active" : ""}`}
              onClick={() => onSelect(key)}
            >
              <span className={`scenario-index ${meta.accent}`}>{meta.index}</span>
              <span className="conversation-copy">
                <b>
                  {item.consumer.name}<small>{meta.label}</small>
                </b>
                <em>{item.messages.at(-1)?.text}</em>
              </span>
              <span className={`risk-pin ${item.perception.risk}`} />
            </button>
          );
        })}
      </div>
      <div className="knowledge-mini">
        <DatabaseOutlined />
        <div><b>美妆知识图谱</b><span>12 场景 · 50+ 成分 · 7 品牌</span></div>
        <CheckCircleFilled />
      </div>
    </aside>
  );
}
