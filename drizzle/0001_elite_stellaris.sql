CREATE TABLE `action_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`action_type` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `service_cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `action_executions_idempotency_uq` ON `action_executions` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `action_executions_case_idx` ON `action_executions` (`case_id`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`email` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `outbox_events` ADD `processed_at` text;