# LumiSense 感光 v2.0 · PRD 落实矩阵

更新日期：2026-08-02

本清单以 `prd-lumisense-v2-dev-ready-2026-08-02.md` 为产品真源。前端产品策略、页面结构、角色与演示口径按 PRD 落实；后端复用现有 Edge D1 Harness 与 Python/LangGraph 生产基线，在不牺牲安全、可测试性和部署兼容性的前提下做等价实现。

## 1. 产品定位与三层亮点

| PRD 要求 | 状态 | 实现与验收 |
| --- | --- | --- |
| LumiSense 感光品牌与“一句话定位” | ✅ | 页面 Header、Metadata、README |
| Sense → Respond → Resolve → Measure | ✅ | 全局产品轨道、坐席右栏模块顺序 |
| 强制产出 1：智能接待辅助插件 | ✅ | `Workspace` 三栏工位、开放输入、两条建议、人工发送 |
| 强制产出 2：风险异常预警看板 | ✅ | `RiskDashboard` 五维雷达、告警、团队、疲劳、转化 |
| WOW 1：潜台词翻译器 | ✅ | 四层 X 光片、置信度、准确/错误反馈 |
| WOW 2：情绪预言家 | ✅ | 观测曲线、三路径、R7 终值、挽回概率、Path C 应用 |
| 引擎：五维共情指数 | ✅ | 工位雷达、个人成长雷达、7 日曲线、改写教练 |
| 功能：情绪—皮肤—产品三轴匹配 | ✅ | 主推/备选/用法/禁忌；高风险时销售门控 |

## 2. RBAC

| 要求 | 状态 | 说明 |
| --- | --- | --- |
| admin / supervisor / agent_senior / agent_junior / viewer 五级 | ✅ | Header 可切换五种比赛演示身份 |
| 菜单和按钮按角色可见/禁用 | ✅ | `roleViews`、`RoleGate`、转接/接管/审批/培训门控 |
| viewer 风险数据脱敏 | ✅ | 前端 masked 视图 + `GET /api/v1/risk/dashboard` 服务端脱敏 |
| 越权访问返回 403 | ✅ | 风险看板、训练数据接口均有服务端角色检查 |
| 写操作包含 user_role 审计 | ✅ | `lumisense_feedback` + `audit_log` 同批写入 |
| admin 在线修改品牌人设 | ✅ | 进化中心配置卡 + `GET/PUT /api/v1/admin/brand` + 审计 |
| 真实身份不信任浏览器角色 | ✅ | Hosted 使用受信用户头/D1 role；Python Profile 使用 JWT |

说明：Header 的角色切换是竞赛演示器，不会改变服务端受信身份。真实生产权限仍由部署身份和数据库角色决定。

## 3. 美妆行业知识体系

| PRD 要求 | 状态 | 实现 |
| --- | --- | --- |
| 12 类核心场景 | ✅ | 产品口径与 Bootstrap API 暴露；Demo 精选 5 条必跑场景 |
| 5 类情绪拐点 | ✅ | 风险预警、自进化知识层展示与场景判断 |
| 成分禁忌与替代 | ✅ | A 醇孕期禁忌、酒精/香精敏感、B5/玻尿酸/胜肽替代 |
| 7 个子品牌人设 | ✅ | 冷启动口径；5 条场景覆盖兰蔻、巴黎欧莱雅、理肤泉、YSL、科颜氏 |
| 禁止极限词与医学承诺 | ✅ | Review/Validator 继续执行；界面明确禁忌与安全边界 |

## 4. 五个 Demo 场景

| 场景 | 潜台词 | 预言 | 三轴 | 风险 |
| --- | --- | --- | --- | --- |
| demo_001 小美过敏 | ✅ | ✅ | 安全门控 | 红 |
| demo_002 莉莉孕期 | ✅ | ✅ | 安全替代 | 黄 |
| demo_003 晓晓爆痘 | ✅ | ✅ | 暂停推荐 | 红 |
| demo_004 王女士送礼 | ✅ | ✅ | 场景化推荐 | 绿 |
| demo_005 林小姐效果落差 | ✅ | ✅ | 先复盘不加售 | 黄 |

此外，`JUDGE CHALLENGE` 支持评委输入任意原话，并复用现有 Run、SSE、Trace、Review 和审批链路。

## 5. Harness

| PRD 组件 | 当前等价实现 | 状态 |
| --- | --- | --- |
| AgentLoop | 有界 ingestion → triage/risk → evidence fan-out → copilot → review | ✅ |
| 多 Agent fork | 风险、证据、潜台词/产品解释并行语义；生产 Profile 保留 LangGraph | ✅ 等价 |
| AGUI 事件 | Hosted 采用 SSE `trace/interrupt/completed`；UI 映射为工具节点进度 | ✅ 等价 |
| 工具沙箱 | 动作白名单、角色、审批与适配器边界 | ✅ |
| 审计日志 | `audit_log` 记录用户、角色、动作、资源和 trace | ✅ |
| 上下文管理 | 最近会话/画像进入结构化输入；Python Profile 支持 checkpoint | ✅ |
| 人工中断 | Review 后进入人工审批；副作用只写 Outbox | ✅ |
| 诚实运行证明 | LIVE MODEL / SAFE FALLBACK、模型、延迟和 Trace | ✅ |

## 6. 风险看板验收

| AC | 状态 | 证据 |
| --- | --- | --- |
| RISK-01 五维雷达与三色状态 | ✅ | `RiskDashboard` + `riskMetrics` |
| RISK-02 告警流与跳转入口 | ✅ | 5 条可见样本、30 条规模口径、操作入口 |
| RISK-03 坐席疲劳 | ✅ | 连续 11 个高危 case、语言温度 52→38、换班建议 |
| RISK-04 团队共情分布 | ✅ | Top/Bottom、疲劳与趋势、培训入口 |
| RISK-05 阈值权限 | ✅ 产品层 | UI 明示仅 AI 管理员可配置；后端阈值配置保留产品化扩展点 |

## 7. 自进化与冷启动

| 要求 | 状态 | 诚实边界 |
| --- | --- | --- |
| Rubric → bad case → 人工复核 → 训练候选 | ✅ | 页面飞轮 + 持久化反馈与训练导出接口 |
| 翻译反馈入训练集 | ✅ | `POST /api/v1/subtext/feedback` |
| 预测反馈可追溯 | ✅ | `POST /api/v1/emotion/feedback` |
| AI 管理员导出训练候选 | ✅ | `GET /api/v1/eval/training-data` |
| 冷启动规模 50/200/30/100/500/7 | ✅ Demo 口径 | 确定性伪数据与统计，不声称真实落库业务数据 |
| SFT / Agentic RL | ⏭️ 路线图 | 不宣称 Demo 已训练或上线，仅展示数据闭环 |

## 8. 关键 API

- 保留：`POST /api/v1/runs`、Run SSE、Run Result、Case Approval、Evaluation。
- 新增：`GET /api/v1/lumisense/bootstrap`。
- 新增：`GET /api/v1/risk/dashboard`。
- 新增：`POST /api/v1/subtext/feedback`。
- 新增：`POST /api/v1/emotion/feedback`。
- 新增：`GET /api/v1/eval/training-data`。
- 新增：`GET/PUT /api/v1/admin/brand`，仅 AI 管理员可更新且写入审计日志。

新接口使用 PRD 的 `{ code, message, data, trace_id? }` 响应结构；原 Harness 接口保持兼容，避免破坏已验证审批链路。

## 9. 明确未伪装为已完成的内容

- 未接真实欧莱雅消费者、订单、产品、会员或经营数据。
- 未执行真实赔付、补发、通知或外部渠道发送。
- 未做医学图像诊断；图片仅保留多模态输入标签和可替换接口。
- 未声称情绪预测已经用真实历史数据标定。
- 未声称完成 SFT、PPO/GRPO 或 Agentic RL。
- 60 条回归是工程验证，不是商业 A/B。

这些边界会直接显示在产品里，避免用“假实时、假模型、假收益”换取演示效果。

## 10. 自动验收

```bash
npm test
python -m pytest backend/tests -q
python -m ruff check backend/app backend/tests backend/alembic
```

新增测试覆盖：LumiSense SSR 内容、冷启动 Bootstrap、风险看板 RBAC、viewer 脱敏、反馈持久化、`user_role` 审计和管理员训练数据导出。
