import {
  scenarios,
  type LumiScenarioKey,
} from "../../demo/domain/lumisense-demo";

export type PresetScenarioKey = Exclude<LumiScenarioKey, "challenge">;

export const scenarioOrder: PresetScenarioKey[] = [
  "allergy",
  "pregnancy",
  "acne",
  "gift",
  "expectation",
];

export const scenarioMeta: Record<
  PresetScenarioKey,
  { index: string; label: string; accent: string }
> = {
  allergy: { index: "01", label: "过敏急救", accent: "red" },
  pregnancy: { index: "02", label: "孕期安全", accent: "amber" },
  acne: { index: "03", label: "爆痘投诉", accent: "red" },
  gift: { index: "04", label: "送礼推荐", accent: "green" },
  expectation: { index: "05", label: "效果落差", accent: "amber" },
};

export const scenarioOptions = scenarioOrder.map((key) => ({
  key,
  label: scenarioMeta[key].label,
  scenario: scenarios[key],
}));
