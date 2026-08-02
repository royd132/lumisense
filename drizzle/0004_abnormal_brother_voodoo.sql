CREATE TABLE `lumisense_config` (
	`config_key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_role` text NOT NULL,
	`updated_at` text NOT NULL
);
