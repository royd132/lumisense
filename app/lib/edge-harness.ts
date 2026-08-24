/**
 * Stable API facade for route handlers and tests.
 *
 * The implementation lives in the Harness feature so HTTP routes do not need
 * to know about orchestration, persistence, approval, or Skill internals.
 */
export * from "../features/harness/server/edge-harness";
export * from "../features/actions/server/action-service";
export * from "../features/analytics/server/dashboard-service";
export * from "../features/evolution/server/evolution-service";
export * from "../features/skill-evolution/server/public-data-evolution";
