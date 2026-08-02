CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_email` text NOT NULL,
	`user_role` text NOT NULL,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`before_state_json` text,
	`after_state_json` text,
	`trace_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_tenant_created_idx` ON `audit_log` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_user_created_idx` ON `audit_log` (`user_email`,`created_at`);--> statement-breakpoint
CREATE TABLE `lumisense_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`user_role` text NOT NULL,
	`conversation_id` text NOT NULL,
	`feedback_type` text NOT NULL,
	`verdict` text NOT NULL,
	`detail` text,
	`training_status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lumisense_feedback_conversation_idx` ON `lumisense_feedback` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `lumisense_feedback_training_idx` ON `lumisense_feedback` (`training_status`,`created_at`);