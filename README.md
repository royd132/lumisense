# CarePulse

CarePulse 是一版“证据驱动的消费者共情客服 Copilot”MVP。它不自动替代客服，也不输出伪精确的情绪分数；系统把消费者语言、业务事实、政策依据、风险信号和人工决策组织为一条可验证、可审查、可恢复的服务链路。

## 这一版包含什么

- 三栏客服工作台：会话、Copilot 建议、证据与风险
- 三条演示链路：普通 FAQ、重复退款投诉、不良反应与舆情威胁
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
- Prometheus 指标与结构化日志
- FAQ、退款、安全、证据缺失、权限绕过、interrupt/resume 等工程测试
- PostgreSQL + pgvector 的 Docker Compose 基线

## 本地运行

前端：

```bash
npm install
npm run dev
```

若需连接本地 Harness，在前端环境中设置：

```bash
NEXT_PUBLIC_CAREPULSE_API_URL=http://localhost:8000
```

没有配置时页面会明确显示“演示模式”，不会声称后端在线，也不会执行副作用。

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

或启动 PostgreSQL 与 API：

```bash
docker compose up --build
```

API 文档位于 `http://localhost:8000/docs`，健康检查位于 `http://localhost:8000/health`。

## 关键接口

- `POST /api/v1/runs`：创建异步分析运行
- `GET /api/v1/runs/{run_id}/events`：订阅 SSE 进度与 Trace
- `GET /api/v1/runs/{run_id}`：获取结构化分析结果
- `POST /api/v1/analyze`：工程测试用同步分析
- `POST /api/v1/cases/{case_id}/approval`：人工接受、编辑、拒绝或升级
- `GET /metrics`：Prometheus 指标

## 接入真实系统时的替换点

当前三个 Agent 使用确定性结构化 fallback，便于无密钥演示与回归测试。生产接入时，只替换 `TriageAgent`、`CopilotAgent` 和 `ReviewAgent` 的方法体为同一个模型 API 的三套 JSON Schema 调用；风险规则、证据服务、校验器、审批门和副作用队列保持独立。

本地默认使用内存适配器；`docker compose up --build` 会切换到 PostgreSQL 运行存储与持久化 LangGraph checkpoint，并单独启动 Outbox Worker。CRM、OMS 和产品库仍是可替换的 typed mock adapter。
