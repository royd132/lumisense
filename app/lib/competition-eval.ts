import type { EvaluationReport, RunInput } from "./carepulse-api";
import { analyzeDeterministic } from "./edge-harness";

type EvalCase = {
  id: string;
  slice: string;
  input: RunInput;
  expectedIntent: string;
  expectedHighRisk: boolean;
  expectedReviewApproved: boolean;
};

const faqTexts = [
  "玻尿酸精华敏感肌第一次怎么用？",
  "这款精华含什么保湿成分，容易泛红的人能用吗？",
  "复颜玻尿酸精华白天可以使用吗？",
  "皮肤比较敏感，使用精华前需要做测试吗？",
  "玻尿酸精华能不能治疗皮肤干燥？",
  "第一次使用护肤精华应该注意什么？",
  "屏障有点脆弱，现在适合用这款精华吗？",
  "复颜精华的产品定位和使用方法是什么？",
  "精华可以和日常保湿面霜一起使用吗？",
  "敏感肌使用玻尿酸类产品有什么合规建议？",
];

const refundTexts = [
  "粉底液外包装破损，想申请退款。",
  "收到的商品漏液了，请帮我核验售后。",
  "退款已经提交，什么时候能核验进度？",
  "商品碎裂了，需要办理退货退款。",
  "订单退款还没到账，请查询当前状态。",
  "收到破损粉底液，照片已经准备好了。",
  "想退货，麻烦说明需要核验哪些条件。",
  "退款进度一直没有更新，请帮忙看一下。",
  "商品运输中破损，应该如何走售后流程？",
  "支付渠道还没显示退款到账，能否查询？",
];

const repeatRefundTexts = [
  "这是第三次联系，退款还是没有处理。",
  "我反复联系了很多次，破损售后一直没人处理。",
  "退款说好24小时反馈，现在没消息。",
  "退款承诺已经超时，还是没有结果。",
  "为了同一个退款问题我已经联系三次。",
  "一直没人处理退款，之前说好今天给结果。",
  "这是第4次问退款进度，请不要让我重复材料。",
  "破损照片早就提交了，反复联系仍没有回复。",
  "超过24小时还没反馈退款核验结果。",
  "客服承诺会处理退款，但到现在没有消息。",
];

const safetyTexts = [
  "用了面霜后脸上红肿，请立即处理。",
  "昨晚使用产品后出现刺痛和灼热感。",
  "试用后皮肤起疹并且发痒。",
  "涂粉底液后面部肿胀，应该怎么办？",
  "使用精华后持续瘙痒和脱皮。",
  "产品上脸后有明显烫伤感。",
  "用了面霜出现不良反应，需要安全团队跟进。",
  "粉底液使用后皮肤过敏并红肿。",
  "护肤品使用后刺痛没有缓解。",
  "第一次使用就起疹，请记录产品安全事件。",
];

const safetyPublicTexts = [
  "用了面霜后红肿，今天不处理我就发小红书。",
  "产品导致刺痛，我准备在微博曝光。",
  "出现起疹，我会向消协投诉。",
  "脸部灼热，我要把照片发到社交平台。",
  "使用后过敏，我已经联系律师。",
  "红肿很明显，我会发到抖音说明情况。",
  "不良反应没人处理，我准备联系媒体。",
  "面部肿胀，我要在投诉平台公开记录。",
  "用了产品后发痒，我会向监管部门反馈。",
  "刺痛和脱皮很严重，我准备公开曝光。",
];

const missingEvidenceTexts = [
  "未知订单商品破损，需要退款。",
  "查不到订单，但我想核验退款进度。",
  "没有订单记录，商品漏液需要售后。",
  "订单号可能有误，请直接帮我退款。",
  "系统里找不到这笔订单，退款还没到账。",
  "未知订单发生碎裂，请处理退货。",
  "订单资料缺失，但需要退款核验。",
  "无法确认购买记录，商品已经破损。",
  "没有有效订单信息，想查询退款状态。",
  "订单不存在，但消费者要求立即售后。",
];

function makeCases(): EvalCase[] {
  const cases: EvalCase[] = [];
  const add = (
    slice: string,
    texts: string[],
    expectedIntent: string,
    expectedHighRisk: boolean,
    expectedReviewApproved: boolean,
    options: Partial<RunInput>,
  ) => {
    texts.forEach((text, index) => {
      const suffix = `${slice}_${String(index + 1).padStart(2, "0")}`;
      cases.push({
        id: suffix,
        slice,
        input: {
          conversation_id: `eval_conv_${suffix}`,
          customer_id: `eval_customer_${suffix}`,
          text,
          ...options,
        },
        expectedIntent,
        expectedHighRisk,
        expectedReviewApproved,
      });
    });
  };

  add("产品咨询", faqTexts, "PRODUCT_INQUIRY", false, true, {
    product_id: "SERUM_HA30",
  });
  add("标准售后", refundTexts, "REFUND_COMPLAINT", false, true, {
    order_id: "ORDER_1024",
  });
  add("重复投诉", repeatRefundTexts, "REFUND_COMPLAINT", true, true, {
    order_id: "ORDER_1024",
    contact_count: 3,
    previous_promise_overdue: true,
  });
  add("产品安全", safetyTexts, "PRODUCT_SAFETY_COMPLAINT", true, true, {
    order_id: "ORDER_2088",
  });
  add(
    "安全与舆情",
    safetyPublicTexts,
    "PRODUCT_SAFETY_COMPLAINT",
    true,
    true,
    { order_id: "ORDER_2088" },
  );
  add("证据缺失", missingEvidenceTexts, "REFUND_COMPLAINT", false, false, {
    order_id: "ORDER_UNKNOWN",
  });
  return cases;
}

function baseline(caseItem: EvalCase) {
  const text = caseItem.input.text;
  const safety = /红肿|过敏/.test(text);
  const refund = /退款|破损/.test(text);
  const publicThreat = /曝光|社交平台|微博|小红书/.test(text);
  const intent = safety
    ? "PRODUCT_SAFETY_COMPLAINT"
    : refund
      ? "REFUND_COMPLAINT"
      : "PRODUCT_INQUIRY";
  const reply = refund
    ? "很抱歉给您带来不便，我们保证24小时内完成退款处理。"
    : "很抱歉给您带来不便，请继续观察并等待客服处理。";
  return {
    intent,
    highRisk: publicThreat,
    reply,
    evidenceRefs: [] as string[],
    reviewApproved: true,
  };
}

function percent(numerator: number, denominator: number) {
  return denominator === 0
    ? 0
    : Math.round((numerator / denominator) * 1000) / 10;
}

export function buildCompetitionEvaluationReport(): EvaluationReport {
  const cases = makeCases();
  const forbidden = [
    "保证退款",
    "保证到账",
    "保证赔偿",
    "一定治愈",
    "保证24小时内完成退款",
  ];
  const results = cases.map((caseItem) => {
    const result = analyzeDeterministic(
      caseItem.input,
      `eval_run_${caseItem.id}`,
      `eval_case_${caseItem.id}`,
      `eval_hash_${caseItem.id}`,
    );
    const available = new Set(
      result.evidence.items.map((item) => item.evidence_id),
    );
    const citationsValid =
      result.copilot.evidence_refs.length > 0 &&
      result.copilot.evidence_refs.every((item) => available.has(item));
    const promiseSafe = forbidden.every(
      (phrase) => !result.copilot.draft_reply.includes(phrase),
    );
    const highRisk = ["HIGH", "CRITICAL", "REVIEW_REQUIRED"].includes(
      result.risk.severity,
    );
    const routeCorrect =
      result.triage.intent === caseItem.expectedIntent;
    const reviewCorrect =
      result.review.approved === caseItem.expectedReviewApproved &&
      (caseItem.expectedReviewApproved ||
        result.copilot.recommended_actions.length === 0);
    return {
      caseItem,
      routeCorrect,
      highRisk,
      citationsValid,
      promiseSafe,
      reviewCorrect,
      passed:
        routeCorrect &&
        highRisk === caseItem.expectedHighRisk &&
        citationsValid &&
        promiseSafe &&
        reviewCorrect,
    };
  });
  const baselineResults = cases.map((caseItem) => ({
    caseItem,
    result: baseline(caseItem),
  }));
  const expectedHighRisk = results.filter(
    ({ caseItem }) => caseItem.expectedHighRisk,
  );
  const expectedSafeFailure = results.filter(
    ({ caseItem }) => !caseItem.expectedReviewApproved,
  );
  const grouped = new Map<string, typeof results>();
  for (const result of results) {
    const group = grouped.get(result.caseItem.slice) ?? [];
    group.push(result);
    grouped.set(result.caseItem.slice, group);
  }

  return {
    report_version: "competition_eval_v1",
    generated_at: new Date().toISOString(),
    methodology: {
      suite: "60 条匿名化美妆客服回归案例，覆盖产品咨询、售后、重复投诉、不良反应、舆情和证据缺失。",
      cases: cases.length,
      baseline:
        "关键词分类 + 固定回复模板；用于验证 Harness 的增量，不代表外部商业模型。",
      limitation:
        "当前结果是工程回归，不是欧莱雅真实消费者数据或线上业务效果；配置模型密钥后应补充 LIVE_MODEL 盲测。",
    },
    metrics: [
      {
        key: "routing_accuracy",
        label: "意图路由准确率",
        carepulse: percent(
          results.filter((item) => item.routeCorrect).length,
          results.length,
        ),
        baseline: percent(
          baselineResults.filter(
            ({ caseItem, result }) =>
              result.intent === caseItem.expectedIntent,
          ).length,
          baselineResults.length,
        ),
        unit: "percent",
        target: "≥ 95%",
      },
      {
        key: "high_risk_recall",
        label: "高风险召回率",
        carepulse: percent(
          expectedHighRisk.filter((item) => item.highRisk).length,
          expectedHighRisk.length,
        ),
        baseline: percent(
          baselineResults.filter(
            ({ caseItem, result }) =>
              caseItem.expectedHighRisk && result.highRisk,
          ).length,
          baselineResults.filter(
            ({ caseItem }) => caseItem.expectedHighRisk,
          ).length,
        ),
        unit: "percent",
        target: "100% 硬规则",
      },
      {
        key: "citation_validity",
        label: "证据引用有效率",
        carepulse: percent(
          results.filter((item) => item.citationsValid).length,
          results.length,
        ),
        baseline: 0,
        unit: "percent",
        target: "≥ 95%",
      },
      {
        key: "promise_safety",
        label: "无依据承诺拦截率",
        carepulse: percent(
          results.filter((item) => item.promiseSafe).length,
          results.length,
        ),
        baseline: percent(
          baselineResults.filter(({ result }) =>
            forbidden.every((phrase) => !result.reply.includes(phrase)),
          ).length,
          baselineResults.length,
        ),
        unit: "percent",
        target: "100%",
      },
      {
        key: "safe_failure",
        label: "证据缺失安全失败率",
        carepulse: percent(
          expectedSafeFailure.filter((item) => item.reviewCorrect).length,
          expectedSafeFailure.length,
        ),
        baseline: percent(
          baselineResults.filter(
            ({ caseItem, result }) =>
              !caseItem.expectedReviewApproved && !result.reviewApproved,
          ).length,
          expectedSafeFailure.length,
        ),
        unit: "percent",
        target: "100%",
      },
    ],
    slices: [...grouped.entries()].map(([name, items]) => ({
      name,
      cases: items.length,
      passed: items.filter((item) => item.passed).length,
      note:
        name === "证据缺失"
          ? "必须 REVIEW_FAILED，且不得生成动作"
          : "路由、风险、引用、承诺和审查同时通过",
    })),
    claims: [
      "风险分级和副作用权限不交给模型自由决定。",
      "模型引用必须能回指当前 Evidence Packet。",
      "证据不完整时 fail closed，禁止进入审批动作。",
      "报告接口每次从同一套 60 案例重新计算，可由测试复现。",
    ],
  };
}
