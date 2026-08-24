# AutoSkill 论文卡：从交互经验到可治理 Skill 生命周期

> Source coverage: Full paper
> Extraction confidence: High
> Locator mode: page-grounded
> Primary analytical lens: Methods
> Secondary analytical lens: Resource
> Context verification: Targeted external check
> Card completeness: Complete relative to supplied source

论文来源：[arXiv:2603.01145v2](https://arxiv.org/abs/2603.01145)；实现来源：[ECNU-ICALK/AutoSkill](https://github.com/ECNU-ICALK/AutoSkill)。PDF 共 22 页；主文包含 3 幅图、2 张表，未提供独立补充材料。

## 术语账本

| 规范术语 | 首次定义 | 本卡片约定 |
| --- | --- | --- |
| AutoSkill | Experience-Driven Lifelong Learning via Skill Self-Evolution | 方法与开源系统均写作 AutoSkill |
| Skill | 可检索、可执行、可版本化的外部行为知识单元 | 不与原始 Memory 记录混用 |
| SkillBank | 持久化 Skill 仓库及其检索索引 | 区分用户级与共享级 |
| Skill evolution | extraction → management → merging/versioning | 不等同于模型参数训练 |
| Skill-enhanced generation | query rewriting → hybrid retrieval → context injection | 仅命中阈值的 Skill 才进入上下文 |

## 01 基本信息

| 字段 | 内容 |
| --- | --- |
| 标题 | AutoSkill: Experience-Driven Lifelong Learning via Skill Self-Evolution |
| 作者 | Yutao Yang, Junsong Li, Qianjun Pan, Bihao Zhan, Yuxuan Cai, Lin Du, Jie Zhou, Kai Chen, Qin Chen, Xin Li, Bo Zhang, Liang He |
| 机构 | East China Normal University；Shanghai AI Laboratory |
| 年份与版本 | 2026，arXiv v2（2026-03-05） |
| 类型 | 方法 / 系统论文；带 SkillBank 资源统计 |
| 代码 | https://github.com/ECNU-ICALK/AutoSkill |
| 数据 | WildChat-1M 的四个过滤子集 |
| 关键词 | Skill、Experience-Driven Lifelong Learning、Self-evolving |
| 对 LumiSense 的位置 | 为“进化中心”提供 Skill 抽取、去重、版本和复用的机制参考，但不能直接替代人工安全门禁 |

[Paper: PDF p. 1, Abstract; PDF p. 2, Introduction]

## 02 一句话总结

[Paper] AutoSkill 将用户侧交互中的稳定约束抽取为结构化、可版本化的 Skill，通过混合检索在后续请求中注入，并以 add / merge / discard 维护 SkillBank，全程不修改基础模型参数；论文展示了大规模抽取与案例，但未证明下游任务成功率得到提升。[Paper: PDF pp. 4–10, Method and System Overview; PDF pp. 11–15, Experimental Analysis]

## 03 研究问题

- [Paper] 具体问题：长期交互中的偏好、纠错和工作流通常只作为对话文本或 Memory 保存，没有被转化为可执行、可维护的行为能力。[Paper: PDF pp. 1–3, Introduction and Related Work]
- [Paper] 为什么重要：用户需要跨会话重复陈述要求；参数更新成本高且难控制，原始 Memory 又难直接约束行为。[Paper: PDF pp. 1–3]
- [Paper] 研究问题：能否在不训练基础模型的情况下，把用户侧交互经验持续转化为显式 Skill，并在未来任务中准确检索、复用和版本化维护？[Paper: PDF pp. 3–4, Method]

## 04 研究背景与发展路径

| 路径 | 能力 | 论文指出的不足 | AutoSkill 的位置 |
| --- | --- | --- | --- |
| 参数更新与 Self-evolution | 通过训练、反思或自生成数据改变行为 | 成本较高，细粒度个性化难控制 | 不改参数，以外部 Skill 演化替代 |
| Long-term Memory / RAG | 保存事实、偏好和历史文本 | 多数仍把经验当作待检索文本 | 把经验提升为可执行行为单元 |
| Tool / Agent Skill | 复用推理、工具与行动轨迹 | Skill 常隐含在 Prompt、轨迹或策略中 | 外显为 SKILL.md，可编辑、合并和迁移 |

[Paper-framed; external verification limited to the official repository.] [Paper: PDF pp. 2–3, Related Work] [External: AutoSkill GitHub README]

## 05 论文识别的核心痛点

| 痛点 | 表现 | 作者解释 | 论文证据 |
| --- | --- | --- | --- |
| 经验短命 | 用户跨会话重复陈述相同偏好 | 交互没有被沉淀为能力 | [Paper: PDF pp. 1–2] |
| Memory 不可执行 | 能检索旧文本，但难稳定约束新任务行为 | 原始记录缺少结构化行为规则 | [Paper: PDF p. 3] |
| Skill 重复与漂移 | 每次纠错都可能形成新 Prompt 片段 | 缺少相似 Skill 检索、合并和版本身份 | [Paper: PDF pp. 7–9] |
| 隐式适配不可治理 | 很难检查模型为何改变 | 能力留在参数或隐式上下文中 | [Paper: PDF pp. 8–11] |

## 06 核心思想

1. [Paper] 表层方法：把交互轨迹抽取为 `(name, description, prompt, triggers, tags, examples, version)` Skill，并持久化到 SkillBank。[Paper: PDF p. 4, Section 3.1]
2. [Paper] 核心机制：服务环负责检索和使用，进化环负责抽取、判断、合并和版本更新；两条环路共享 SkillBank。[Paper: PDF p. 4, Figure 1]
3. [Analysis] 可迁移原则：真正的“自进化”不是反馈数量增加，而是候选能力经过复用性判断、相似项管理、离线验证和可回滚发布后，能在未来任务中被正确命中。

## 07 方法总览

**输入：** 当前用户请求、近期用户侧对话、现有 SkillBank。

**输出：** 当前回复、Skill 管理动作、新增或新版本 Skill。

```text
当前请求 + 历史
  ├─ 服务环：Query Rewrite → Dense + BM25 → Thresholded Top-K → Skill-conditioned Response
  └─ 进化环：User-only Extraction → Similar Skill Retrieval → add / merge / discard → Version Bump
```

[Paper] 训练要求为“training-free”；需要通用 LLM、Embedding 模型和五组任务 Prompt。作者特别规定 Skill 抽取以用户请求为主要证据，模型回复只作上下文，减少模型自我复制错误。[Paper: PDF pp. 4–8, Sections 3.1–3.5]

## 08 核心模块拆解

| 模块 | 功能 | 必要性 | 输入与输出 | 支撑证据 | 移除后的已知/预期影响 |
| --- | --- | --- | --- | --- | --- |
| Query Rewriting | 将上下文请求改写为独立检索查询 | 处理指代、延续任务和新约束 | 请求+历史 → 查询 | [Paper: PDF p. 5] | [Analysis] 检索召回可能下降；论文无消融 |
| Hybrid Retrieval | 融合 Dense 与 BM25 | 同时覆盖语义和精确触发词 | 查询+Skill → Top-K | [Paper: PDF p. 5] | [Analysis] 单一检索的失败边界未测 |
| Skill Extraction | 抽取稳定、可复用约束 | 过滤一次性请求和实例事实 | 用户侧窗口 → 候选 Skill | [Paper: PDF p. 6] | 无候选能力形成 |
| Management Judge | add / merge / discard | 控制噪声与重复 | 候选+最近邻 Skill → 决策 | [Paper: PDF p. 7] | SkillBank 容易膨胀或污染 |
| Skill Merge | 语义合并并保留能力身份 | 累积纠错而不复制多份 Skill | 旧 Skill+候选 → 新版本 | [Paper: PDF pp. 7–8] | 反馈无法沉淀到同一能力 |
| SkillBank | 存储用户级/共享级 Skill 与向量索引 | 跨会话复用和可审查 | Skill Artifact ↔ Retrieval Context | [Paper: PDF pp. 8–10] | 退化为会话内 Prompt |

## 09 必要公式与符号

### Skill 表示

`s = (n, d, p, τ, γ, ξ, v)`

- `n` 名称，`d` 描述，`p` 可执行指令；
- `τ` 触发集合，`γ` 标签集合，`ξ` 示例集合，`v` 版本。

用途是让能力具备稳定身份、触发面和版本，而非只保存一段 Prompt。[Paper: PDF p. 4, Section 3.1]

### 混合相关性

`Rel(q, s) = λ·d̂(q, s) + (1−λ)·b̂(q, s)`

`d̂` 和 `b̂` 分别为归一化 Dense 与 BM25 分数；仅 `Top-K` 且高于阈值 `η` 的 Skill 被注入。[Paper: PDF p. 5, Section 3.3.1]

### SkillBank 更新

```text
add     : B(t+1) = B(t) ∪ {candidate}
merge   : B(t+1) = (B(t) − {matched}) ∪ {merged_version}
discard : B(t+1) = B(t)
```

合并不是文本拼接，而是保留身份、语义去重并执行版本升级。[Paper: PDF pp. 7–8, Sections 3.4.2–3.4.3]

## 10 实验设计与证据链

### 数据与协议

- [Paper] 数据来自 WildChat-1M，只保留超过 8 轮的会话。[Paper: PDF p. 11, Section 5.1]
- [Paper] 按语言（中文/英文）与模型家族（GPT-3.5/GPT-4）分成四个子集，共 22,511 段会话、596,693 条消息，抽取 1,858 个 Skill。[Paper: PDF p. 11, Table 1]
- [Paper] 统计通过扫描四个 SkillBank 下的 SKILL.md 得到，标签做大小写归一化。[Paper: PDF p. 12, Section 5.2]
- [Paper] Figure 2 将 1,858 个 Skill 分为八类；Figure 3 统计 Skill 元数据中的社交平台提及次数，两图都是产物分布描述，不是下游效用评测。[Paper: PDF p. 12, Figure 2; Figure 3]

| 实验 | 检验主张 | 对比与条件 | 结果 | 支持的结论 | 不支持的更强结论 | 来源 |
| --- | --- | --- | --- | --- | --- | --- |
| 四子集抽取统计 | 能从真实交互批量形成 Skill | 四个语言/模型子集，同一抽取管线 | 1,858 个 Skill | 系统能规模化产出结构化 Skill | Skill 正确、有用或改善任务成功率 | [Paper: PDF p. 11, Table 1] |
| 类别与标签统计 | Skill 覆盖多个任务域 | 扫描名称、标签和触发词 | 编程 482、写作 363、AI/ML 354 等 | 产物类别具有一定广度 | 对真实任务分布具有代表性 | [Paper: PDF pp. 11–12, Table 2, Figures 2–3] |
| 版本案例 | 相似反馈可合并到同一 Skill | 两个案例，无对照 | `professional_text_rewrite` 达 v0.1.34 | 系统记录了多次版本更新 | 34 次更新都提升质量且无回归 | [Paper: PDF pp. 13–15] |

## 11 结论的正确解释

- [Paper] 任务范围是 Skill 抽取、存储、检索和维护，不是端到端客服或工具任务成功率评估。[Paper: PDF pp. 8–15]
- [Paper] 论文没有提供任务基线、消融、统计不确定性、人工 Skill 正确率或在线 A/B。[Paper: PDF pp. 11–15]
- [Analysis] “抽取出 1,858 个 Skill”证明产量，不证明复用价值；版本号增长证明发生过合并，不证明合并质量提升。
- [Analysis] 使用 WildChat 真实交互会继承隐私、噪声、恶意指令、平台分布和用户自报偏差；论文没有给出安全过滤与授权治理的实证。

**有界结论：** AutoSkill 给出了一个可部署、可解释的外部 Skill 生命周期实现，并证明它能在大规模对话上形成和版本化 Skill Artifact；是否提高下游表现、是否安全、是否避免长期污染，仍需任务级和治理级评估。

## 12 作者明确承认的局限

No explicit author-acknowledged limitation was found in the supplied source.

论文结论仅提出未来方向，没有单独的 Limitations 章节，也没有明确列出实证边界。[Paper: PDF p. 15, Conclusions and Future Work]

## 13 批判性分析

| `[Analysis]` 观察 | 潜在问题 | 为什么重要 | 如何验证 | 依据 |
| --- | --- | --- | --- | --- |
| 只有产量统计，没有效用评估 | 噪声 Skill 也会增加数量 | 不能证明后续任务变好 | 固定模型与预算，对比无 Skill / 原始 Memory / AutoSkill 的任务成功率 | [Paper: PDF pp. 11–15] |
| Skill 抽取只依赖用户侧文本 | 用户错误陈述可能被固化 | 高风险领域会放大错误策略 | 增加来源可信度、规则冲突和专家复核切片 | [Paper: PDF p. 6] |
| add / merge / discard 由 Prompt Judge 决定 | 决策稳定性与漂移未测 | 错误 merge 会污染已有能力 | 多次采样一致性、反事实候选、人工金标 F1 | [Paper: PDF p. 7] |
| 检索权重、Top-K、阈值未做消融 | Skill 可能误触发或漏触发 | 直接影响上下文污染和成本 | 在固定 SkillBank 上画 precision-recall / latency 曲线 | [Paper: PDF p. 5] |
| 版本升级没有回归门禁 | 新约束可能覆盖旧安全规则 | “进化”可能造成能力退化 | 每个候选版本执行 Skill 单测、全局回归和一键回滚 | [Paper: PDF pp. 7–8, 13–15] |
| 数据治理描述不足 | 真实会话可能含个人数据与恶意内容 | 无法直接生产落地 | 去标识化、授权、保留期限、审计与删除演练 | [Paper: PDF pp. 10–12] |

## 14 学到的知识

### Agent-derived knowledge candidates

- 将 Memory 与 Skill 分层：Memory 回答“发生过什么”，Skill 回答“同类任务应该怎么做”。
- Skill 需要稳定身份、触发条件、执行约束、例子、版本和来源，而不只是 Prompt 文本。
- Skill 服务环与进化环应解耦，避免学习任务阻塞在线响应。
- 新候选先检索最近邻，再做管理决策，比把整个 SkillBank 塞给 Judge 更可扩展。
- Skill 演化的核心质量指标应是未来复用效用、误触发率与回归风险，而非 Skill 数量。

## 15 与现有知识的连接

- [External] AutoSkill 官方仓库在论文后继续加入 SkillEvo，明确采用 replay、evaluation、mutation 和 promotion；这说明后续实现本身也在补足论文中的评测与晋升缺口。[AutoSkill GitHub README]
- [Analysis] LumiSense 现有 `feedback → human review → regression → release` 比论文的自动 add / merge 更适合消费者安全场景，但缺少论文中的结构化 Skill Artifact、相似 Skill 管理和版本检索 Trace。
- [Analysis] 最合理的组合不是用 AutoSkill 替换现有 Harness，而是在 Harness 外增加一个受治理 Skill 生命周期：用户反馈和公开数据产生候选，影子评测决定是否值得复核，人工批准后才进入可检索 Active SkillBank。

## 16 研究与产品改进候选

### Agent-derived research candidates

#### 候选 1：Safety-Gated AutoSkill

- 起点：AutoSkill 缺少版本发布前的任务级与安全回归。[Paper: PDF pp. 11–15]
- [Hypothesis] 在 add / merge 后加入安全切片影子评测和人工 Promotion，可在保持 Skill 覆盖增益的同时降低回归风险。
- 变化：`extract → judge → merge` 后增加 `shadow eval → human promote → rollback pointer`。
- Validation：公开美妆安全评论 + 60 条现有回归；比较风险召回率、误报率、回复合规率、延迟与旧切片回归。
- 证伪：候选 Skill 未提高公开数据召回，或导致任一高风险基线回归。
- 可能失败：公开评论与客服对话分布不同；规则触发提升可能伴随误报。
- 创新状态：unverified；prior-art search required。

#### 候选 2：Evidence-Bound Skill Artifact

- 起点：论文 Skill Tuple 没有强制来源和有效期。[Paper: PDF p. 4]
- [Hypothesis] 为 Skill 增加 `source_refs`、`evidence_count`、`owner_scope`、`expires_at` 和 `rollback_version`，可提高人工复核效率并降低过期规则污染。
- 变化：扩展 Skill Schema，不改变基础模型。
- Validation：让复核人员盲评带/不带来源的候选，比较批准准确率、耗时和撤回率。
- 证伪：来源字段不改变复核质量，或显著增加维护成本。
- 可能失败：来源本身不可靠；复杂元数据降低 Skill 可移植性。
- 创新状态：unverified；prior-art search required。

#### 候选 3：Counterfactual Skill Retrieval Test

- 起点：论文未验证检索到的 Skill 是否真正改善当前任务。[Paper: PDF p. 5]
- [Hypothesis] 对每个候选版本同时运行“注入 / 不注入 / 注入最近邻旧版”三路反事实测试，可识别无效或有害 Skill。
- 变化：把 Skill 效用从相似度判断改为任务输出差异判断。
- Validation：固定模型、温度和输入，使用成对盲评与硬安全指标。
- 证伪：反事实评测噪声过大，不能稳定预测在线收益。
- 可能失败：评测成本高；Judge 与生成模型同源导致偏差。
- 创新状态：unverified；prior-art search required。
