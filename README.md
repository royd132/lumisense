# LumiSense 感光 v2.0

LumiSense 是面向欧莱雅美妆客服场景的 AI 共情管家：用数据让 AI 从“辅助回答”升级为“辅助共情”，让客服从成本中心变成可量化、可治理的增长触点。

产品按照 `prd-lumisense-v2-dev-ready-2026-08-02.md` 重构，核心闭环为：

> Sense 感知 → Respond 回应 → Resolve 解决 → Measure 衡量

逐条 PRD 映射与验收位置见 [`docs/lumisense-v2-prd-coverage.md`](docs/lumisense-v2-prd-coverage.md)。原 CarePulse 工程基线保留在 [`docs/requirements-coverage.md`](docs/requirements-coverage.md)，作为底层 Harness、审批和生产 Profile 的实现说明。

## 当前产品能力

### 强制产出 1：智能接待辅助插件

- 五个可直接演示的美妆场景：过敏急救、孕期安全、爆痘投诉、送礼推荐、效果落差
- 场景工作室：可自行设置消费者姓名、场景类型、品牌、肤质、性格、核心诉求、订单证据与完整多轮会话
- 评委开放输入：任意消费者原话都进入同一 Run、SSE、Trace 与人工审批链路
- 实时三轴感知：情绪、皮肤状态、产品与成分信号
- 两条可编辑共情建议，一键填入人工回复区
- 高风险场景默认禁止销售推荐，优先安全处置
- 明确区分 `LIVE MODEL + HARNESS`、`EDGE HARNESS ONLINE` 与 `DEMO PREVIEW`，不伪装模型运行

### 强制产出 2：风险异常预警看板

- 负面情绪、升级率、高危响应、AI 采纳率、AHT 五维风险雷达
- 30 条冷启动告警规模和实时告警流
- 坐席疲劳预警、团队共情排行与培训入口
- 共情转化漏斗，并明确标注 Demo 假设与真实 A/B 边界
- viewer 角色自动显示脱敏内容

### WOW 层

- 情绪考古师：整段会话时间对齐、情绪转折点定位、根因链与处方建议；单轮证据不足时明确拒绝伪因果
- 潜台词摘要：保留为实时建议栏的单轮辅助能力，不再作为核心 WOW
- 情绪预言家：观察轨迹 + 未来三轮 A/B/C 路径 + 挽回概率 + 推荐原因

### 引擎与功能层

- 共情指数：情绪识别、痛点回应、方案有效、语言温度、品牌契合五维评分
- 情绪—皮肤—产品三轴匹配：主推荐、替代、使用说明与禁忌
- 12 类美妆场景、5 类情绪拐点、50+ 成分规则、7 个子品牌人设

### Harness 与自进化

- AgentLoop：Sense → Think → Act → Observe → Reflect
- 多节点 Trace、模型模式、延迟、证据与安全回退状态
- 人工审批门 + Transactional Outbox，Agent 不直接执行副作用
- 潜台词/预测反馈写入 `lumisense_feedback`
- 所有反馈写操作同步写入 `audit_log`，包含 `user_role` 与 `trace_id`
- bad case 进入人工复核队列，经修正、批准或驳回后形成受治理训练候选
- 产品不宣称模型会在生产流量中自行改写权重；“自进化”指反馈数据、规则/Prompt 版本、回归集和发布门禁的闭环

## 完整演示流程

1. 在“智能接待”点击“自定义消费者与场景”，填写消费者画像、业务上下文与多轮会话。
2. 点击“运行场景”，输入会提交到在线 Edge Harness；顶部运行徽标和 AgentLoop Trace 展示状态机进度。
3. 查看情绪考古师的转折点/根因链、情绪预言家的未来三轮预测、证据卡与独立 Review。
4. 采纳或编辑建议；涉及赔付、升级等副作用时，必须经过人工审批门与 Outbox。
5. 在建议卡点击“准确 / 部分准确 / 需修正”，反馈写入 D1 并留下审计记录。
6. 将右上角色切换为“AI 管理员”或“客服主管”，进入“进化中心”。
7. 在 Bad Case 复核台填写正确表达并批准为训练候选，或驳回脏数据；随后用 60 条回归集验证版本再发布。

“Harness 重跑此场景”不是刷新页面：它会把当前完整输入重新提交给 Sense → Think → Act → Observe → Reflect 状态机，生成一个新的、可回放和可审计的 Run。

## RBAC

产品提供五种演示身份视图：

| 角色 | 等级 | 主要能力 |
| --- | --- | --- |
| AI 管理员 | L4 | 品牌、知识、训练数据、全量审计 |
| 客服主管 | L3 | 风险看板、团队分布、培训派发 |
| 资深客服 | L2 | 高危会话、转接接管、反馈 |
| 新手客服 | L1 | 日常会话、建议采纳、个人成长 |
| 查看者 | L0 | 脱敏风险态势、个人分只读 |

前端身份切换用于比赛演示权限差异；真实接口继续使用受信身份和服务端 RBAC，不能依赖浏览器角色参数。

## 冷启动伪数据

Demo 展示口径：50 个消费者画像、200 条历史会话、30 条预警事件、100 个 SKU、500 条订单、7 个品牌人设。当前仓库提供确定性场景和统计工厂，用于黑客松演示，不代表欧莱雅真实消费者或经营数据。

## 关键接口

- `POST /api/v1/runs`：创建异步 Agent Harness 运行
- `GET /api/v1/runs/{run_id}/events`：订阅 SSE / AGUI 风格事件
- `GET /api/v1/runs/{run_id}`：获取结构化分析结果
- `POST /api/v1/cases/{case_id}/approval`：人工批准受控动作
- `GET /api/v1/lumisense/bootstrap`：LumiSense 产品、角色、场景和冷启动口径
- `GET /api/v1/risk/dashboard`：服务端 RBAC 风险看板；viewer 数据脱敏
- `POST /api/v1/subtext/feedback`：潜台词翻译反馈与审计
- `POST /api/v1/emotion/feedback`：情绪预测反馈与审计
- `GET /api/v1/evolution/summary`：进化闭环实时计数与最近反馈
- `POST /api/v1/evolution/feedback/{feedback_id}/review`：人工修正并批准/驳回训练候选
- `GET /api/v1/eval/training-data`：仅 AI 管理员导出训练候选
- `GET/PUT /api/v1/admin/brand`：仅 AI 管理员读取/更新品牌人设并审计
- `GET /api/v1/evaluation`：在线复算 60 条工程回归案例

## 本地运行

```bash
npm install
npm run dev
```

默认使用站点内置的同源 Edge Harness。连接本地 Python/LangGraph Profile：

```bash
NEXT_PUBLIC_CAREPULSE_API_URL=http://localhost:8000
```

设置 `NEXT_PUBLIC_CAREPULSE_API_ENABLED=false` 可强制使用确定性演示数据。

Python 生产基线：

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

或启动 PostgreSQL、迁移、API 与独立 Worker：

```bash
export CAREPULSE_JWT_SECRET="replace-with-a-long-random-secret"
docker compose up --build
```

## 模型与安全边界

Hosted Edge Harness 提供 Triage、Copilot、Review 三套严格 JSON Schema 模型调用。配置 `OPENAI_API_KEY` 后使用 `OPENAI_MODEL`；任何密钥缺失、超时、解析或验证失败都会整轮降级到确定性结构化 fallback，并在界面和 Trace 中明确标记。

风险规则、成分禁忌、证据服务、验证器、人工审批门和副作用队列独立于模型。急性不良反应场景不做销售推荐，不进行医学诊断或原因推断。

## 验证

```bash
npm test
python -m pytest backend/tests -q
python -m ruff check backend/app backend/tests backend/alembic
```

工程回归覆盖运行、SSE、D1、RBAC、脱敏、潜台词反馈、审计、训练候选、审批、Outbox、60 条美妆案例和服务端渲染。
