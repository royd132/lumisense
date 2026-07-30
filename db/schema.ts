import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const serviceCases = sqliteTable(
  "service_cases",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    customerId: text("customer_id").notNull(),
    state: text("state").notNull(),
    route: text("route").notNull(),
    riskSeverity: text("risk_severity").notNull(),
    resultJson: text("result_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("service_cases_state_idx").on(table.state),
    index("service_cases_conversation_idx").on(table.conversationId),
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
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("outbox_events_idempotency_uq").on(table.idempotencyKey),
    index("outbox_events_status_idx").on(table.status),
  ],
);
