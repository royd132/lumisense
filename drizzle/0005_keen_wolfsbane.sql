CREATE TABLE `skill_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`skill_key` text NOT NULL,
	`version` text NOT NULL,
	`status` text NOT NULL,
	`source_type` text NOT NULL,
	`source_refs_json` text NOT NULL,
	`artifact_json` text NOT NULL,
	`parent_id` text,
	`created_by` text NOT NULL,
	`created_role` text NOT NULL,
	`created_at` text NOT NULL,
	`promoted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_artifacts_key_version_uq` ON `skill_artifacts` (`skill_key`,`version`);--> statement-breakpoint
CREATE INDEX `skill_artifacts_status_idx` ON `skill_artifacts` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `skill_evolution_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_dataset` text NOT NULL,
	`status` text NOT NULL,
	`baseline_skill_id` text NOT NULL,
	`candidate_skill_id` text NOT NULL,
	`management_decision_json` text NOT NULL,
	`metrics_json` text NOT NULL,
	`trace_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_role` text NOT NULL,
	`created_at` text NOT NULL,
	`promoted_at` text
);
--> statement-breakpoint
CREATE INDEX `skill_evolution_runs_status_idx` ON `skill_evolution_runs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `skill_evolution_runs_trace_idx` ON `skill_evolution_runs` (`trace_id`);