import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const serviceCases = sqliteTable(
  "service_cases",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    customerId: text("customer_id").notNull(),
    ownerEmail: text("owner_email"),
    assignedAgentEmail: text("assigned_agent_email"),
    originalInput: text("original_input"),
    sanitizedInput: text("sanitized_input"),
    requestKey: text("request_key"),
    state: text("state").notNull(),
    route: text("route").notNull(),
    riskSeverity: text("risk_severity").notNull(),
    resultJson: text("result_json").notNull(),
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("service_cases_state_idx").on(table.state),
    index("service_cases_conversation_idx").on(table.conversationId),
    index("service_cases_owner_idx").on(table.ownerEmail),
    uniqueIndex("service_cases_request_key_uq").on(table.requestKey),
  ],
);

export const agentRuns = sqliteTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => serviceCases.id),
    status: text("status").notNull(),
    requestJson: text("request_json").notNull(),
    resultJson: text("result_json").notNull(),
    inputHash: text("input_hash"),
    promptVersion: text("prompt_version"),
    modelAlias: text("model_alias"),
    error: text("error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("agent_runs_case_idx").on(table.caseId)],
);

export const runEvents = sqliteTable(
  "run_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id")
      .notNull()
      .references(() => agentRuns.id),
    eventType: text("event_type").notNull(),
    dataJson: text("data_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("run_events_run_idx").on(table.runId, table.id)],
);

export const agentArtifacts = sqliteTable(
  "agent_artifacts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id")
      .notNull()
      .references(() => agentRuns.id),
    artifactType: text("artifact_type").notNull(),
    dataJson: text("data_json").notNull(),
    promptVersion: text("prompt_version"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("agent_artifacts_run_idx").on(table.runId),
    uniqueIndex("agent_artifacts_run_type_uq").on(
      table.runId,
      table.artifactType,
    ),
  ],
);

export const approvalEvents = sqliteTable(
  "approval_events",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => serviceCases.id),
    agentId: text("agent_id").notNull(),
    agentRole: text("agent_role").notNull(),
    decision: text("decision").notNull(),
    approvedActionIdsJson: text("approved_action_ids_json").notNull(),
    editedReply: text("edited_reply"),
    reason: text("reason"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("approval_events_case_idx").on(table.caseId)],
);

export const outboxEvents = sqliteTable(
  "outbox_events",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => serviceCases.id),
    actionType: text("action_type").notNull(),
    payloadJson: text("payload_json").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: text("next_attempt_at"),
    processedAt: text("processed_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("outbox_events_idempotency_uq").on(table.idempotencyKey),
    index("outbox_events_status_idx").on(table.status),
  ],
);

export const actionExecutions = sqliteTable(
  "action_executions",
  {
    id: text("id").primaryKey(),
    outboxEventId: text("outbox_event_id"),
    caseId: text("case_id")
      .notNull()
      .references(() => serviceCases.id),
    actionType: text("action_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull(),
    resultJson: text("result_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("action_executions_idempotency_uq").on(table.idempotencyKey),
    index("action_executions_case_idx").on(table.caseId),
  ],
);

export const riskEvents = sqliteTable(
  "risk_events",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => serviceCases.id),
    severity: text("severity").notNull(),
    signalsJson: text("signals_json").notNull(),
    route: text("route").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("risk_events_case_idx").on(table.caseId),
    index("risk_events_severity_idx").on(table.severity),
  ],
);

export const userRoles = sqliteTable("user_roles", {
  email: text("email").primaryKey(),
  role: text("role").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const lumisenseFeedback = sqliteTable(
  "lumisense_feedback",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull(),
    userRole: text("user_role").notNull(),
    conversationId: text("conversation_id").notNull(),
    feedbackType: text("feedback_type").notNull(),
    verdict: text("verdict").notNull(),
    detail: text("detail"),
    trainingStatus: text("training_status").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("lumisense_feedback_conversation_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    index("lumisense_feedback_training_idx").on(
      table.trainingStatus,
      table.createdAt,
    ),
  ],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    userEmail: text("user_email").notNull(),
    userRole: text("user_role").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    beforeStateJson: text("before_state_json"),
    afterStateJson: text("after_state_json"),
    traceId: text("trace_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("audit_log_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("audit_log_user_created_idx").on(table.userEmail, table.createdAt),
  ],
);

export const lumisenseConfig = sqliteTable("lumisense_config", {
  configKey: text("config_key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedRole: text("updated_role").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const skillArtifacts = sqliteTable(
  "skill_artifacts",
  {
    id: text("id").primaryKey(),
    skillKey: text("skill_key").notNull(),
    version: text("version").notNull(),
    status: text("status").notNull(),
    sourceType: text("source_type").notNull(),
    sourceRefsJson: text("source_refs_json").notNull(),
    artifactJson: text("artifact_json").notNull(),
    parentId: text("parent_id"),
    createdBy: text("created_by").notNull(),
    createdRole: text("created_role").notNull(),
    createdAt: text("created_at").notNull(),
    promotedAt: text("promoted_at"),
  },
  (table) => [
    uniqueIndex("skill_artifacts_key_version_uq").on(
      table.skillKey,
      table.version,
    ),
    index("skill_artifacts_status_idx").on(table.status, table.createdAt),
  ],
);

export const skillEvolutionRuns = sqliteTable(
  "skill_evolution_runs",
  {
    id: text("id").primaryKey(),
    sourceDataset: text("source_dataset").notNull(),
    status: text("status").notNull(),
    baselineSkillId: text("baseline_skill_id").notNull(),
    candidateSkillId: text("candidate_skill_id").notNull(),
    managementDecisionJson: text("management_decision_json").notNull(),
    metricsJson: text("metrics_json").notNull(),
    traceId: text("trace_id").notNull(),
    createdBy: text("created_by").notNull(),
    createdRole: text("created_role").notNull(),
    createdAt: text("created_at").notNull(),
    promotedAt: text("promoted_at"),
  },
  (table) => [
    index("skill_evolution_runs_status_idx").on(table.status, table.createdAt),
    index("skill_evolution_runs_trace_idx").on(table.traceId),
  ],
);
