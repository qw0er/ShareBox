import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openDatabase, type StateDatabase } from "../server/db/client.server";

const migrationCount = readMigrationFiles({
	migrationsFolder: "drizzle",
}).length;
let root: string;
let state: string;
let dbPath: string;
const connections: StateDatabase[] = [];
beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "sharebox-db-"));
	state = path.join(root, "state");
	fs.mkdirSync(state, { mode: 0o700 });
	dbPath = path.join(state, "state.db");
});
afterEach(() => {
	for (const connection of connections.splice(0))
		if (connection.sqlite.open) connection.sqlite.close();
	fs.rmSync(root, { recursive: true, force: true });
});
function open(folder?: string) {
	const connection = openDatabase(dbPath, folder);
	connections.push(connection);
	return connection;
}
function nextMigration(sql: string) {
	const folder = path.join(root, "drizzle");
	fs.cpSync(path.resolve("drizzle"), folder, { recursive: true });
	const journalPath = path.join(folder, "meta/_journal.json");
	const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
	const last = journal.entries.at(-1);
	journal.entries.push({
		...last,
		idx: last.idx + 1,
		tag: "0001_test",
		when: last.when + 1,
	});
	fs.writeFileSync(journalPath, JSON.stringify(journal));
	fs.writeFileSync(path.join(folder, "0001_test.sql"), sql);
	return folder;
}
it("initializes an empty database with WAL, timeout, private permissions and a unique file path", () => {
	const { sqlite } = open();
	expect(sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
	expect(sqlite.pragma("busy_timeout", { simple: true })).toBe(5000);
	expect(fs.statSync(dbPath).mode & 0o777).toBe(0o600);
	for (const suffix of ["-wal", "-shm"])
		expect(fs.statSync(`${dbPath}${suffix}`).mode & 0o777).toBe(0o600);
	sqlite
		.prepare(
			"INSERT INTO shares (id, target_path, target_dev, target_ino, created_at) VALUES (?, ?, ?, ?, ?)",
		)
		.run("id", "file", "1", "2", "now");
	expect(() =>
		sqlite
			.prepare(
				"INSERT INTO shares (id, target_path, target_dev, target_ino, created_at) VALUES (?, ?, ?, ?, ?)",
			)
			.run("other", "file", "1", "2", "now"),
	).toThrow();
});
it("backs up files, staging and the database before upgrading to the next version; reopening is idempotent", () => {
	fs.mkdirSync(path.join(state, "files"));
	fs.mkdirSync(path.join(state, "staging"));
	fs.writeFileSync(path.join(state, "files", "keep"), "contents");
	fs.writeFileSync(path.join(state, "staging", "partial"), "partial");
	open().sqlite.close();
	const folder = nextMigration("CREATE TABLE upgrade_marker (value TEXT);");
	const before = fs.readdirSync(path.join(state, "backups"));
	const upgraded = open(folder);
	expect(
		upgraded.sqlite
			.prepare("SELECT count(*) AS n FROM __drizzle_migrations")
			.get(),
	).toEqual({ n: migrationCount + 1 });
	expect(upgraded.sqlite.prepare("SELECT * FROM upgrade_marker").all()).toEqual(
		[],
	);
	const backupName = fs
		.readdirSync(path.join(state, "backups"))
		.find((name) => !before.includes(name));
	expect(backupName).toBeTruthy();
	const backup = path.join(state, "backups", backupName || "missing");
	expect(fs.readFileSync(path.join(backup, "files/keep"), "utf8")).toBe(
		"contents",
	);
	expect(fs.readFileSync(path.join(backup, "staging/partial"), "utf8")).toBe(
		"partial",
	);
	const saved = new Database(path.join(backup, "state.db"), { readonly: true });
	expect(
		saved.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get(),
	).toEqual({ n: migrationCount });
	saved.close();
	upgraded.sqlite.close();
	const snapshots = fs.readdirSync(path.join(state, "backups"));
	open(folder);
	expect(fs.readdirSync(path.join(state, "backups"))).toEqual(snapshots);
});
it("rolls back failed migration SQL and preserves the old journal", () => {
	open().sqlite.close();
	const folder = nextMigration(
		"CREATE TABLE must_rollback (id TEXT);\n--> statement-breakpoint\nINVALID SQL;",
	);
	expect(() => open(folder)).toThrow();
	const previous = open();
	expect(
		previous.sqlite
			.prepare("SELECT name FROM sqlite_master WHERE name = 'must_rollback'")
			.get(),
	).toBeUndefined();
	expect(
		previous.sqlite
			.prepare("SELECT count(*) AS n FROM __drizzle_migrations")
			.get(),
	).toEqual({ n: migrationCount });
});
it("rejects a future version and changed history before mutating the database", () => {
	open().sqlite.close();
	const folder = nextMigration("CREATE TABLE future_table (id TEXT);");
	open(folder).sqlite.close();
	const original = fs.readFileSync(dbPath);
	expect(() => open()).toThrow("newer");
	expect(fs.readFileSync(dbPath)).toEqual(original);
	const db = new Database(dbPath);
	db.prepare(
		"UPDATE __drizzle_migrations SET hash = 'changed' WHERE created_at = (SELECT min(created_at) FROM __drizzle_migrations)",
	).run();
	db.close();
	expect(() => open(folder)).toThrow("unsupported");
});
it.each(["state.db", "state.db-wal", "state.db-shm", "state.db-journal"])(
	"rejects symlinks at %s",
	(name) => {
		const outside = path.join(root, "outside");
		fs.writeFileSync(outside, "untouched");
		fs.symlinkSync(outside, path.join(state, name));
		expect(() => open()).toThrow("Invalid database file");
		expect(fs.readFileSync(outside, "utf8")).toBe("untouched");
	},
);
it("rejects an unknown nonempty schema", () => {
	const sqlite = new Database(dbPath);
	sqlite.exec("CREATE TABLE unknown (value TEXT)");
	sqlite.close();
	expect(() => open()).toThrow("Unrecognized database schema");
});

it("aborts initialization when the snapshot directory is unsafe", () => {
	const outside = path.join(root, "outside");
	fs.mkdirSync(outside);
	fs.symlinkSync(outside, path.join(state, "backups"));
	expect(() => open()).toThrow("Invalid backup directory");
	expect(fs.existsSync(dbPath)).toBe(false);
	expect(fs.readdirSync(outside)).toEqual([]);
});

it("upgrades the original shares-only schema while preserving published links", () => {
	const folder = path.join(root, "shares-only");
	fs.cpSync(path.resolve("drizzle"), folder, { recursive: true });
	const journalPath = path.join(folder, "meta/_journal.json");
	const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
	journal.entries = journal.entries.slice(0, 1);
	fs.writeFileSync(journalPath, JSON.stringify(journal));
	const legacy = open(folder);
	legacy.sqlite
		.prepare(
			"INSERT INTO shares (id, target_path, target_dev, target_ino, created_at) VALUES ('existing-share', 'keep.txt', '1', '2', 'now')",
		)
		.run();
	legacy.sqlite.close();
	const upgraded = open();
	expect(
		upgraded.sqlite
			.prepare("SELECT target_path FROM shares WHERE id = 'existing-share'")
			.get(),
	).toEqual({ target_path: "keep.txt" });
	expect(
		upgraded.sqlite.prepare("SELECT * FROM admin_credentials").all(),
	).toEqual([]);
});
