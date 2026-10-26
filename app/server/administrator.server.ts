import { eq } from "drizzle-orm";
import type { StateDatabase } from "./db/client.server.ts";
import { adminCredentials } from "./db/schema.ts";
import { logger } from "./logger.server.ts";
import { generateCredentials, isPasswordHash } from "./password.server.ts";

type Credentials = { username: string; passwordHash: string; secret: string };
type ConsoleWriter = (text: string) => void;
const writeConsole: ConsoleWriter = (text) => {
	process.stdout.write(text);
};

function storedCredentials(database: StateDatabase): Credentials | undefined {
	const row = database.db
		.select()
		.from(adminCredentials)
		.where(eq(adminCredentials.id, 1))
		.get();
	if (!row) return undefined;
	if (
		!row.username.trim() ||
		!isPasswordHash(row.passwordHash) ||
		Buffer.byteLength(row.sessionSecret) < 32
	) {
		throw new Error(
			"Stored administrator credentials are invalid; stop the application and run npm run auth:reset",
		);
	}
	return {
		username: row.username,
		passwordHash: row.passwordHash,
		secret: row.sessionSecret,
	};
}

function printPassword(
	username: string,
	password: string,
	write: ConsoleWriter,
) {
	// Intentional one-time disclosure: bypass normal secret redaction and log-level
	// filtering. Never include this password or the signing key in ordinary logs.
	write(
		`\nShareBox 管理员凭据\n用户名: ${username}\n密码: ${password}\n请保存密码；重启不会再次显示。\n\n`,
	);
}

export async function initializeAdministrator(
	database: StateDatabase,
	write: ConsoleWriter = writeConsole,
): Promise<Credentials> {
	const existing = storedCredentials(database);
	if (existing) return existing;
	const generated = await generateCredentials();
	const credentials = {
		username: "admin",
		passwordHash: generated.passwordHash,
		secret: generated.secret,
	};
	const result = database.db.transaction(
		(tx) => {
			// Another initializer may have finished while scrypt was deriving the hash.
			const current = storedCredentials(database);
			if (current) return { credentials: current, created: false };
			tx.insert(adminCredentials)
				.values({
					id: 1,
					username: credentials.username,
					passwordHash: credentials.passwordHash,
					sessionSecret: credentials.secret,
				})
				.run();
			return { credentials, created: true };
		},
		{ behavior: "immediate" },
	);
	if (result.created) {
		logger.info({ component: "auth" }, "Administrator credentials initialized");
		printPassword(result.credentials.username, generated.password, write);
	}
	return result.credentials;
}

export async function resetAdministrator(
	database: StateDatabase,
	write: ConsoleWriter = writeConsole,
): Promise<Credentials> {
	const generated = await generateCredentials();
	const credentials = database.db.transaction(
		(tx) => {
			const existing = tx
				.select()
				.from(adminCredentials)
				.where(eq(adminCredentials.id, 1))
				.get();
			if (!existing)
				throw new Error(
					"Administrator is not initialized; start ShareBox first",
				);
			tx.update(adminCredentials)
				.set({
					passwordHash: generated.passwordHash,
					sessionSecret: generated.secret,
				})
				.where(eq(adminCredentials.id, 1))
				.run();
			return {
				username: existing.username,
				passwordHash: generated.passwordHash,
				secret: generated.secret,
			};
		},
		{ behavior: "immediate" },
	);
	logger.info(
		{ component: "auth" },
		"Administrator password and session key reset",
	);
	printPassword(credentials.username, generated.password, write);
	return credentials;
}
