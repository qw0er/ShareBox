CREATE TABLE `shares` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'file' NOT NULL,
	`target_path` text NOT NULL,
	`target_dev` text NOT NULL,
	`target_ino` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shares_target_path_idx` ON `shares` (`target_path`);