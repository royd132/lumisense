CREATE TABLE `agent_artifacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`artifact_type` text NOT NULL,
	`data_json` text NOT NULL,
	`prompt_version` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agent_artifacts_run_idx` ON `agent_artifacts` (`run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_artifacts_run_type_uq` ON `agent_artifacts` (`run_id`,`artifact_type`);--> statement-breakpoint
CREATE TABLE `risk_events` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`severity` text NOT NULL,
	`signals_json` text NOT NULL,
	`route` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `service_cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `risk_events_case_idx` ON `risk_events` (`case_id`);--> statement-breakpoint
CREATE INDEX `risk_events_severity_idx` ON `risk_events` (`severity`);--> statement-breakpoint
ALTER TABLE `action_executions` ADD `outbox_event_id` text;--> statement-breakpoint
ALTER TABLE `agent_runs` ADD `input_hash` text;--> statement-breakpoint
ALTER TABLE `agent_runs` ADD `prompt_version` text;--> statement-breakpoint
ALTER TABLE `agent_runs` ADD `model_alias` text;--> statement-breakpoint
ALTER TABLE `outbox_events` ADD `next_attempt_at` text;--> statement-breakpoint
ALTER TABLE `service_cases` ADD `owner_email` text;--> statement-breakpoint
ALTER TABLE `service_cases` ADD `assigned_agent_email` text;--> statement-breakpoint
ALTER TABLE `service_cases` ADD `original_input` text;--> statement-breakpoint
ALTER TABLE `service_cases` ADD `sanitized_input` text;--> statement-breakpoint
ALTER TABLE `service_cases` ADD `request_key` text;--> statement-breakpoint
ALTER TABLE `service_cases` ADD `resolved_at` text;--> statement-breakpoint
CREATE INDEX `service_cases_owner_idx` ON `service_cases` (`owner_email`);--> statement-breakpoint
CREATE UNIQUE INDEX `service_cases_request_key_uq` ON `service_cases` (`request_key`);