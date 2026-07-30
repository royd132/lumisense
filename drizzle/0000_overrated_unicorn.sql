CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`status` text NOT NULL,
	`request_json` text NOT NULL,
	`result_json` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `service_cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agent_runs_case_idx` ON `agent_runs` (`case_id`);--> statement-breakpoint
CREATE TABLE `approval_events` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`agent_role` text NOT NULL,
	`decision` text NOT NULL,
	`approved_action_ids_json` text NOT NULL,
	`edited_reply` text,
	`reason` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `service_cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `approval_events_case_idx` ON `approval_events` (`case_id`);--> statement-breakpoint
CREATE TABLE `outbox_events` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`action_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `service_cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_events_idempotency_uq` ON `outbox_events` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `outbox_events_status_idx` ON `outbox_events` (`status`);--> statement-breakpoint
CREATE TABLE `run_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`event_type` text NOT NULL,
	`data_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `run_events_run_idx` ON `run_events` (`run_id`,`id`);--> statement-breakpoint
CREATE TABLE `service_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`state` text NOT NULL,
	`route` text NOT NULL,
	`risk_severity` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `service_cases_state_idx` ON `service_cases` (`state`);--> statement-breakpoint
CREATE INDEX `service_cases_conversation_idx` ON `service_cases` (`conversation_id`);