# LumiSense 代码架构

更新日期：2026-08-24

## 1. 重构依据

本轮没有按“多 Agent 数量”模仿项目，而是提取客服 Agent 中可复用的工程边界。

| 参考项目 | 可信度 | 借鉴点 | 没有照搬的部分 |
| --- | --- | --- | --- |
| [OpenAI Customer Support Agent HITL Demo](https://github.com/openai/openai-support-agent-demo) | OpenAI 官方客服示例 | `components / config / tools / stores / API routes` 分责；敏感动作由人确认 | Demo 的内存状态和占位副作用 |
| [Google ADK Customer Service Sample](https://github.com/google/adk-samples/tree/main/python/agents/customer-service) | Google 官方、10k+ stars 样例仓库 | `agent / prompts / entities / tools / callbacks / eval` 分责；评测与运行并列 | 单 Agent 目录形态和 mock 工具状态 |
| [Energy Agent AI](https://github.com/hazardscarn/energyagentai) | Google ADK Hackathon 北美区域冠军 | 按客户经营能力拆 Agent 域；共享工具独立；协调器只路由 | 为展示而扩张的多 Agent 数量 |
| [SalesShortcut](https://github.com/merdandt/SalesShortcut) | Google ADK Hackathon 全球总冠军 | 服务边界、共享配置、生命周期回调、并行 fan-out/gather | 34 Agent、5 微服务；对 LumiSense 当前规模过重 |
| [Call Automation](https://github.com/Keerthivasan-Venkitajalam/Call-Automation) | SpinSci AI Hackathon 2025 Grand Prize | `core / workflows / adapters / services / monitoring / security`；配置驱动行业切换 | 语音、医疗与 Kubernetes 专属层 |

## 2. 目标原则

1. **薄入口**：`app/page.tsx` 只挂载产品 Shell；Route Handler 只处理 HTTP、身份和参数。
2. **垂直产品切片**：工作台、风险、成长、进化各自拥有组件；修改风险页不需要进入产品总文件。
3. **Harness 核心分层**：运行编排不再同时承担审批、Outbox、报表和 Skill 发布。
4. **纯领域层**：Skill 定义和公开数据评测不依赖 Cloudflare 或 D1，可独立测试。
5. **稳定外观层**：`app/lib/*` 暂时保留为兼容 facade，避免一次性改坏所有 API 路由。
6. **人类治理独立于模型**：动作审批和 Skill Promotion 都是服务端业务域，不放进 Prompt 或 UI 状态。

## 3. 当前目录

```text
app/
├─ api/                              # 薄 HTTP Route Handlers
├─ components/                       # 跨产品域 UI 原语
│  ├─ EChart.tsx
│  ├─ LumiMark.tsx
│  ├─ RoleGate.tsx
│  └─ SectionHead.tsx
├─ features/
│  ├─ shell/LumiSenseApp.tsx         # 角色、导航和页面组合
│  ├─ workbench/components/          # 智能接待与 Harness 操作
│  ├─ risk/components/               # 消费者风险预警
│  ├─ growth/components/             # 共情成长
│  ├─ evolution/components/          # 进化中心
│  ├─ demo/domain/                   # 比赛场景与确定性 view model
│  ├─ harness/
│  │  ├─ api/client.ts               # 类型化 HTTP 客户端与契约
│  │  └─ server/                     # Run 编排与模型适配器
│  ├─ actions/server/                # 审批、受控动作、Outbox
│  ├─ analytics/server/              # 持久化指标与队列看板
│  ├─ evolution/server/              # 反馈、复核、品牌配置
│  └─ skill-evolution/
│     ├─ domain/                     # 纯 Skill Artifact 与影子切片
│     └─ server/                     # D1 版本、Promotion、审计
├─ lib/                              # 兼容 facade；禁止重新堆业务
└─ page.tsx                          # 六行框架入口
```

## 4. 依赖方向

```text
page → shell → feature components
feature components → typed Harness client + demo view models
API routes → compatibility facades → feature server services
Harness orchestration → model adapter + action service
Skill server service → pure Skill domain + D1
domain ─X→ HTTP / D1 / Cloudflare runtime
```

依赖只向内流动：领域对象不知道页面和数据库，HTTP 路由不知道 SQL，模型适配器不能直接执行外部副作用。

## 5. 架构守门

`tests/architecture.test.mjs` 自动检查：

- Next 页面和兼容 facade 必须保持薄；
- Skill domain 与浏览器客户端不得导入 D1 或 Worker Runtime；
- 主要模块设置 800 行上限，防止重新生成巨型“万能文件”；
- 原有 60 条回归、D1、RBAC、审批和 Skill Promotion 测试继续作为行为守门。

## 6. 后续重构边界

- `edge-harness.ts` 下一步可继续拆出确定性分析器和证据提供器，但应以新增真实证据源为触发条件，避免只为目录美观继续抽象。
- `globals.css` 仍较大；下一次视觉功能开发时，按 `workbench / risk / evolution` 迁移为 CSS Modules，当前不在无视觉变更的架构重构中机械拆分。
- Python Profile 已有相对清晰的 `harness / orchestrator / retrieval / store / worker` 分层，本轮不做无收益的目录搬迁。
