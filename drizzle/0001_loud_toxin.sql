CREATE TABLE `admin_credentials` (
	`id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`session_secret` text NOT NULL,
	CONSTRAINT "admin_credentials_singleton" CHECK("admin_credentials"."id" = 1)
);
