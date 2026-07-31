# CarePulse

CarePulse 是一版“证据驱动的消费者共情客服 Copilot”竞赛验证版。它不自动替代客服，也不输出伪精确的情绪分数；系统把消费者语言、业务事实、政策依据、风险信号和人工决策组织为一条可验证、可审查、可恢复的服务链路。

逐条需求、实现位置、运行 Profile 与验收命令见
[`docs/requirements-coverage.md`](docs/requirements-coverage.md)。

## 这一版包含什么

- 三栏客服工作台：会话、Copilot 建议、证据与风险
- 三条演示链路：普通 FAQ、重复退款投诉、不良反应与舆情威胁
- 评委开放输入：可粘贴任意美妆客服问题，现场创建受控 Run
- 模型运行证明：明确区分 `LIVE MODEL` 与 `SAFE FALLBACK`，展示模型、延迟、Token 与 Trace
- 60 条匿名化美妆客服回归案例及固定模板基线对照
- 风险运行看板：高风险会话、问题类型、承诺健康度、升级队列
- 可编辑建议回复，以及接受、拒绝、升级的人工作业门
- FastAPI + Pydantic v2 API
- LangGraph 有界状态图、持久化 checkpoint、真实 `interrupt()` / `Command(resume=...)`
- 硬规则优先的 `RiskSignalEngine`
- `asyncio.gather` 并行证据获取
- REST + SSE 运行进度
- 统一 Runtime Harness：负责运行、SSE、人工恢复、权限与副作用边界
- 角色/Scope 审批策略，回复审批与动作审批相互独立
- PostgreSQL 事务 Outbox、`SKIP LOCKED` Worker、指数退避与死信状态
- SQLAlchemy 2 的案例、Run/Step/Event、审批、Outbox 与政策向量数据模型
- Alembic 迁移、PostgreSQL FTS + pgvector 混合检索与批准政策种子数据
- Prometheus 指标、OpenTelemetry Span 与结构化日志
- FAQ、退款、安全、证据缺失、权限绕过、interrupt/resume 等工程测试
- PostgreSQL + pgvector 的 Docker Compose 基线

## 本地运行

前端：

```bash
npm install
npm run dev
```

默认使用站点内置的同源 Edge Harness；线上运行、Trace、人工停点、审批与
Outbox 状态会持久化到 D1。Outbox 消费后生成幂等的受控动作任务；在接入正式
OMS/CRM adapter 前不会伪装成已完成外部操作。若需改连本地 Python/LangGraph
Harness，可设置：

```bash
NEXT_PUBLIC_CAREPULSE_API_URL=http://localhost:8000
```

设置 `NEXT_PUBLIC_CAREPULSE_API_ENABLED=false` 才会进入纯演示模式；运行时连接
失败则自动标记为“演示回退”，不会执行副作用。

若在 Windows PowerShell 中运行，可直接使用：

```powershell
$env:WRANGLER_LOG_PATH=".wrangler/wrangler.log"
npx vinext dev
```

后端：

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

API 文档位于 `http://localhost:8000/docs`，健康检查位于 `http://localhost:8000/health`。
非演示模式只接受由 `CAREPULSE_JWT_SECRET` 验证的 HS256 JWT，且要求
`sub`、`role`、`exp`、`iss=carepulse` 和 `aud=carepulse-api`；身份与角色不会从
客户端 `X-Agent-*` 请求头读取。

线上 Edge Harness 从 D1 的 `user_roles` 表读取角色，未配置用户默认是 `AGENT`。
主管权限必须由运维显式写入该表，例如：

```sql
INSERT INTO user_roles (email, role, updated_at)
VALUES ('supervisor@example.com', 'SUPERVISOR', datetime('now'));
```

## 关键接口

- `POST /api/v1/runs`：创建异步分析运行
- `GET /api/v1/runs/{run_id}/events`：订阅 SSE 进度与 Trace
- `GET /api/v1/runs/{run_id}`：获取结构化分析结果
- `GET /api/v1/dashboard`：获取当前身份范围内的风险聚合
- `GET /api/v1/evaluation`：实时复算 60 案例竞赛评测报告
- `GET /api/v1/me`：获取可信身份与角色
- `POST /api/v1/analyze`：工程测试用同步分析
- `POST /api/v1/cases/{case_id}/approval`：人工接受、编辑、拒绝或升级
- `GET /metrics`：Prometheus 指标

## 接入真实系统时的替换点

线上 Edge Harness 已提供同一个模型 API 的三套严格 JSON Schema 调用：`TriageAgent`、`CopilotAgent` 和 `ReviewAgent`。配置 `OPENAI_API_KEY` 后使用 `OPENAI_MODEL`（默认 `gpt-5.6-luna`）；任何调用缺失、超时或失败都会整轮降级到确定性结构化 fallback，并在页面和 Trace 中明确标记。风险规则、证据服务、校验器、审批门和副作用队列始终独立于模型。

竞赛评测接口每次从同一套 60 条匿名化 fixture 重新计算路由准确率、高风险召回率、证据引用有效率、无依据承诺拦截率和证据缺失安全失败率。当前对照是“关键词分类 + 固定回复模板”的工程基线，不冒充真实业务 A/B 测试；获得授权数据后应补充盲测和人工客服接受/修改结果。

本地默认使用内存适配器；`docker compose up --build` 会先执行 Alembic，
再切换到 PostgreSQL 运行存储、混合政策检索与持久化 LangGraph checkpoint，
并单独启动 Outbox Worker。CRM、OMS 和产品库仍是可替换的 typed mock adapter。
