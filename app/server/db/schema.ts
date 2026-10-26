import { sql } from "drizzle-orm";
import {
	check,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const shares = sqliteTable(
	"shares",
	{
		id: text("id").primaryKey(),
		kind: text("kind", { enum: ["file"] })
			.notNull()
			.default("file"),
		targetPath: text("target_path").notNull(),
		targetDev: text("target_dev").notNull(),
		targetIno: text("target_ino").notNull(),
		createdAt: text("created_at").notNull(),
	},
	(table) => [uniqueIndex("shares_target_path_idx").on(table.targetPath)],
);

export const adminCredentials = sqliteTable(
	"admin_credentials",
	{
		id: integer("id").primaryKey().notNull(),
		username: text("username").notNull(),
		passwordHash: text("password_hash").notNull(),
		sessionSecret: text("session_secret").notNull(),
	},
	(table) => [check("admin_credentials_singleton", sql`${table.id} = 1`)],
);
