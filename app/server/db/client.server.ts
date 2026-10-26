import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { logger } from "../logger.server.ts";
import * as schema from "./schema.ts";

export type StateDatabase = ReturnType<typeof openDatabase>;

// Check the complete journal prefix before changing pragmas or running migrations.
// An older binary must never silently open a database from a newer deployment.
function appliedMigrationCount(
	dbPath: string,
	migrations: ReturnType<typeof readMigrationFiles>,
) {
	if (!fs.existsSync(dbPath)) return 0;
	const sqlite = new Database(dbPath, { readonly: true, fileMustExist: true });
	try {
		const tables = sqlite
			.prepare(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
			)
			.all() as { name: string }[];
		if (!tables.some((table) => table.name === "__drizzle_migrations")) {
			if (tables.length) throw new Error("Unrecognized database schema");
			return 0;
		}
		const applied = sqlite
			.prepare(
				"SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at",
			)
			.all() as { hash: string; created_at: number }[];
		if (applied.length > migrations.length)
			throw new Error("Database version is newer than this application");
		for (const [index, row] of applied.entries()) {
			const expected = migrations[index];
			if (
				!expected ||
				row.hash !== expected.hash ||
				row.created_at !== expected.folderMillis
			) {
				throw new Error(
					"Database migration history is unsupported by this application",
				);
			}
		}
		return applied.length;
	} finally {
		sqlite.close();
	}
}

function validateDatabaseFiles(dbPath: string) {
	for (const filename of [
		dbPath,
		`${dbPath}-wal`,
		`${dbPath}-shm`,
		`${dbPath}-journal`,
	]) {
		const stats = fs.lstatSync(filename, { throwIfNoEntry: false });
		if (stats && (!stats.isFile() || stats.isSymbolicLink()))
			throw new Error(`Invalid database file: ${filename}`);
	}
}

function backupState(stateDir: string) {
	const backupsDir = path.join(stateDir, "backups");
	const stats = fs.lstatSync(backupsDir, { throwIfNoEntry: false });
	if (stats && (!stats.isDirectory() || stats.isSymbolicLink()))
		throw new Error("Invalid backup directory");
	if (!stats) fs.mkdirSync(backupsDir, { mode: 0o700 });
	fs.chmodSync(backupsDir, 0o700);
	const backupPath = path.join(backupsDir, `pre-migration-${randomUUID()}`);
	fs.mkdirSync(backupPath, { mode: 0o700 });
	// Keep the backup inside the writable volume. Exclude past backups rather
	// than recursively copying backup history on every schema upgrade.
	for (const name of fs.readdirSync(stateDir)) {
		if (name === "backups") continue;
		fs.cpSync(path.join(stateDir, name), path.join(backupPath, name), {
			recursive: true,
			dereference: false,
			errorOnExist: true,
			force: false,
		});
	}
	return backupPath;
}

export function openDatabase(
	dbPath: string,
	migrationsFolder = path.resolve("drizzle"),
) {
	let sqlite: Database.Database | undefined;
	try {
		validateDatabaseFiles(dbPath);
		const migrations = readMigrationFiles({ migrationsFolder });
		if (!migrations.length) throw new Error("Database migrations are missing");
		const appliedCount = appliedMigrationCount(dbPath, migrations);
		if (appliedCount < migrations.length) {
			const backupPath = backupState(path.dirname(dbPath));
			// Startup runs before requests; the single-instance deployment must be stopped
			// during upgrades. Copy files, staging, DB and WAL together for restoration.
			logger.info(
				{ component: "database", backupPath, appliedCount },
				"State backed up before migration",
			);
		}
		if (!fs.existsSync(dbPath)) {
			const fd = fs.openSync(
				dbPath,
				fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
				0o600,
			);
			fs.closeSync(fd);
		}
		fs.chmodSync(dbPath, 0o600);
		sqlite = new Database(dbPath);
		sqlite.pragma("busy_timeout = 5000");
		sqlite.pragma("journal_mode = WAL");
		const db = drizzle(sqlite, { schema });
		migrate(db, { migrationsFolder });
		logger.info(
			{ component: "database", migrationCount: migrations.length },
			"Database initialized",
		);
		return { sqlite, db };
	} catch (err) {
		sqlite?.close();
		logger.fatal(
			{ component: "database", err },
			"Database initialization failed",
		);
		throw err;
	}
}
