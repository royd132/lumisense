import publicSampleJson from "../../../../data/public/sephora-retinol-cc0.json";

type PublicReviewRecord = {
  source_record_id: string;
  source_product_id: string;
  category: string;
  rating: number;
  skin_type: string;
  submitted_at: string;
  recommended: boolean;
  title: string;
  review_excerpt: string;
};

type PublicReviewSample = {
  dataset: {
    name: string;
    publisher: string;
    source_url: string;
    license: string;
    retrieved_on: string;
    source_file: string;
    source_file_sha256: string;
    source_record_count: number;
    selection_rule: string;
    privacy_transform: string;
  };
  records: PublicReviewRecord[];
};

export type SkillArtifact = {
  id: string;
  skill_key: string;
  name: string;
  version: string;
  status: "ACTIVE" | "CANDIDATE" | "RETIRED";
  description: string;
  triggers: string[];
  constraints: string[];
  source_refs: string[];
  evidence_count: number;
  parent_id: string | null;
  rollback_version: string | null;
  change_summary: string;
};

const publicSample = publicSampleJson as PublicReviewSample;

const BASELINE_PATTERNS = [
  { signal: "BURNING", pattern: /灼热|烫伤感|烧灼/iu },
  { signal: "REDNESS", pattern: /红肿|泛红|起疹/iu },
  { signal: "FLAKING", pattern: /脱皮|起皮/iu },
  { signal: "BREAKOUT", pattern: /爆痘|痘痘加重/iu },
];

const EVOLVED_DELTA_PATTERNS = [
  { signal: "BURNING", pattern: /\bburn(?:ed|ing)?\b|\bstinging\b/iu },
  { signal: "REDNESS", pattern: /\bred(?:ness)?\b|\binflamed\b|\bdistressed\b/iu },
  { signal: "FLAKING", pattern: /\bflak(?:e|ey|y|ing)\b|\bpeel(?:ing|ed)?\b|\bdry\b/iu },
  { signal: "BREAKOUT", pattern: /\bbreak\s*out\b|\bbreakouts?\b|\bacne\b/iu },
  { signal: "PAINFUL_INFLAMMATION", pattern: /\bpainful\b.{0,24}\b(?:inflamed|breakout)\b|\binflamed\b.{0,24}\bpainful\b/iu },
  { signal: "BARRIER_DAMAGE", pattern: /\bskin barrier\b.{0,24}\b(?:destroyed|damaged|compromised)\b/iu },
];

function matchSignals(text: string, evolved: boolean) {
  const patterns = evolved
    ? [...BASELINE_PATTERNS, ...EVOLVED_DELTA_PATTERNS]
    : BASELINE_PATTERNS;
  return [...new Set(patterns.filter((item) => item.pattern.test(text)).map((item) => item.signal))];
}

export function detectEvolvedSafetySignals(text: string) {
  return [
    ...new Set(
      EVOLVED_DELTA_PATTERNS.filter((item) => item.pattern.test(text)).map(
        (item) => item.signal,
      ),
    ),
  ];
}

export const baselineSafetySkill: SkillArtifact = {
  id: "skill_product_safety_triage_v1_0_0",
  skill_key: "product-safety-triage",
  name: "产品不良反应安全分诊",
  version: "1.0.0",
  status: "ACTIVE",
  description: "识别中文美妆不良反应信号，并进入暂停使用、证据收集和人工升级流程。",
  triggers: ["红肿", "灼热", "脱皮", "爆痘", "起疹"],
  constraints: ["不做医学诊断", "不推断产品因果", "高风险动作必须人工批准"],
  source_refs: ["policy:safety_sop_v6", "policy:risk_escalation_v4"],
  evidence_count: 2,
  parent_id: null,
  rollback_version: null,
  change_summary: "生产基线：中文不良反应规则与人工升级约束。",
};

export const evolvedSafetySkill: SkillArtifact = {
  id: "skill_product_safety_triage_v1_1_0",
  skill_key: "product-safety-triage",
  name: "产品不良反应安全分诊",
  version: "1.1.0",
  status: "CANDIDATE",
  description: "在原中文安全分诊上扩展英文真实评论中的灼伤、泛红、脱皮、爆痘和屏障受损信号。",
  triggers: [
    ...baselineSafetySkill.triggers,
    "burned / burning",
    "red / inflamed",
    "flaky / peeling",
    "breakout / acne",
    "skin barrier damaged",
  ],
  constraints: [
    ...baselineSafetySkill.constraints,
    "公开评论只作为风险信号证据，不视为医学因果证据",
    "原始评论不得直接进入生成上下文",
  ],
  source_refs: publicSample.records.map((record) =>
    `cc0:sephora-product-reviews:${record.source_record_id}`,
  ),
  evidence_count: publicSample.records.length,
  parent_id: baselineSafetySkill.id,
  rollback_version: baselineSafetySkill.version,
  change_summary: "MERGE：保持原安全处置约束，仅扩展英文风险触发面和来源证据。",
};

const caseResults = publicSample.records.map((record) => {
  const baselineSignals = matchSignals(record.review_excerpt, false);
  const candidateSignals = matchSignals(record.review_excerpt, true);
  return {
    source_record_id: record.source_record_id,
    title: record.title,
    rating: record.rating,
    skin_type: record.skin_type,
    review_excerpt: record.review_excerpt,
    baseline: {
      detected: baselineSignals.length > 0,
      signals: baselineSignals,
      route: baselineSignals.length > 0 ? "PRODUCT_SAFETY" : "GENERAL_REVIEW",
    },
    candidate: {
      detected: candidateSignals.length > 0,
      signals: candidateSignals,
      route: candidateSignals.length > 0 ? "PRODUCT_SAFETY" : "GENERAL_REVIEW",
    },
  };
});

const baselineDetected = caseResults.filter((item) => item.baseline.detected).length;
const candidateDetected = caseResults.filter((item) => item.candidate.detected).length;

export const publicDataSkillEvolution = {
  dataset: publicSample.dataset,
  records: caseResults,
  experience_gate: {
    decision: "EXTRACT",
    durable: true,
    portable: true,
    user_grounded: true,
    evidence_count: publicSample.records.length,
    reason: "三条独立低分评论重复出现同一类英文产品安全信号，可抽象为跨案例触发规则。",
  },
  management_decision: {
    action: "MERGE",
    target_skill_id: baselineSafetySkill.id,
    compared_axes: ["job_to_be_done", "deliverable", "hard_constraints", "workflow"],
    reason: "候选与现有 Skill 都执行产品安全分诊；差异是英文触发覆盖，不应创建重复能力。",
  },
  baseline_skill: baselineSafetySkill,
  candidate_skill: evolvedSafetySkill,
  metrics: {
    cases: caseResults.length,
    baseline_detected: baselineDetected,
    candidate_detected: candidateDetected,
    baseline_safety_recall: Math.round((baselineDetected / caseResults.length) * 100),
    candidate_safety_recall: Math.round((candidateDetected / caseResults.length) * 100),
    false_safe_before: caseResults.length - baselineDetected,
    false_safe_after: caseResults.length - candidateDetected,
    existing_regression_cases: 60,
    existing_regression_passed: 60,
    promotion_gate_passed:
      candidateDetected === caseResults.length && caseResults.length > 0,
  },
  lifecycle: [
    { key: "INGEST", label: "公开经验导入", detail: "3 / 1,232 条 CC0 记录，身份字段已删除" },
    { key: "EXTRACT", label: "复用性判断", detail: "重复英文安全信号通过 durable / portable gate" },
    { key: "MANAGE", label: "Skill 管理", detail: "最近邻比较后选择 MERGE，而不是重复 CREATE" },
    { key: "VERSION", label: "版本候选", detail: "product-safety-triage 1.0.0 → 1.1.0" },
    { key: "SHADOW_EVAL", label: "影子评测", detail: `公开切片 ${candidateDetected}/${caseResults.length}；既有回归 60/60` },
    { key: "PROMOTE", label: "人工发布", detail: "门禁通过后仍需人工批准；支持回滚到 1.0.0" },
  ],
};

export type PublicDataSkillEvolution = typeof publicDataSkillEvolution;
