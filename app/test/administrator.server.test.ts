import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	initializeAdministrator,
	resetAdministrator,
} from "../server/administrator.server";
import { openDatabase, type StateDatabase } from "../server/db/client.server";
import { verifyPassword } from "../server/password.server";

let root: string;
let state: string;
let database: StateDatabase;
const exec = promisify(execFile);
beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "sharebox-administrator-"));
	state = path.join(root, "state");
	fs.mkdirSync(state);
	database = openDatabase(path.join(state, "state.db"));
});
afterEach(() => {
	if (database.sqlite.open) database.sqlite.close();
	fs.rmSync(root, { recursive: true, force: true });
});
function emittedPassword(write: ReturnType<typeof vi.fn>) {
	const output = write.mock.calls.map((call) => call[0]).join("");
	const password = /^Password: ([A-Za-z0-9_-]{32})$/m.exec(output)?.[1];
	if (!password)
		throw new Error("Expected a generated password in console output");
	return password;
}
it("generates usable credentials once, persists only a hash, and preserves them on restart", async () => {
	const write = vi.fn();
	const settings = await initializeAdministrator(database, write);
	const password = emittedPassword(write);
	expect(settings.username).toBe("admin");
	expect(settings.secret).toMatch(/^[a-f0-9]{64}$/);
	expect(await verifyPassword(password, settings.passwordHash)).toBe(true);
	expect(write).toHaveBeenCalledOnce();
	expect(write.mock.calls[0][0]).not.toContain(settings.secret);
	expect(write.mock.calls[0][0]).not.toContain(settings.passwordHash);
	expect(database.sqlite.serialize().includes(Buffer.from(password))).toBe(
		false,
	);
	database.sqlite.close();
	database = openDatabase(path.join(state, "state.db"));
	const restartWrite = vi.fn();
	expect(await initializeAdministrator(database, restartWrite)).toEqual(
		settings,
	);
	expect(restartWrite).not.toHaveBeenCalled();
});
it("coalesces overlapping initialization into one account and one password announcement", async () => {
	const write = vi.fn();
	const [first, second] = await Promise.all([
		initializeAdministrator(database, write),
		initializeAdministrator(database, write),
	]);
	expect(first).toEqual(second);
	expect(write).toHaveBeenCalledOnce();
	expect(
		database.sqlite
			.prepare("SELECT count(*) AS n FROM admin_credentials")
			.get(),
	).toEqual({ n: 1 });
	expect(() =>
		database.sqlite
			.prepare(
				"INSERT INTO admin_credentials VALUES (2, 'other', 'hash', 'secret')",
			)
			.run(),
	).toThrow();
});
it("does not announce credentials when persistence fails", async () => {
	database.sqlite.exec(
		"CREATE TRIGGER reject_admin BEFORE INSERT ON admin_credentials BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
	);
	const write = vi.fn();
	await expect(initializeAdministrator(database, write)).rejects.toThrow();
	expect(write).not.toHaveBeenCalled();
	expect(
		database.sqlite.prepare("SELECT * FROM admin_credentials").all(),
	).toEqual([]);
});
it("refuses corrupted persisted credentials rather than silently generating a new password", async () => {
	await initializeAdministrator(database, vi.fn());
	database.sqlite
		.prepare("UPDATE admin_credentials SET password_hash = 'corrupt'")
		.run();
	const write = vi.fn();
	await expect(initializeAdministrator(database, write)).rejects.toThrow(
		"Stored administrator credentials are invalid",
	);
	expect(write).not.toHaveBeenCalled();
});
it("resets the password and signing key while keeping the username and restoring corrupt credentials", async () => {
	const before = await initializeAdministrator(database, vi.fn());
	database.sqlite
		.prepare("UPDATE admin_credentials SET password_hash = 'corrupt'")
		.run();
	const write = vi.fn();
	const reset = await resetAdministrator(database, write);
	expect(reset.username).toBe(before.username);
	expect(reset.secret).not.toBe(before.secret);
	expect(reset.passwordHash).not.toBe(before.passwordHash);
	expect(await verifyPassword(emittedPassword(write), reset.passwordHash)).toBe(
		true,
	);
	expect(await initializeAdministrator(database, vi.fn())).toEqual(reset);
});
it("runs the reset command using the same state database and leaves shared files untouched", async () => {
	const initial = await initializeAdministrator(database, vi.fn());
	fs.mkdirSync(path.join(state, "files"));
	fs.writeFileSync(path.join(state, "files/keep.txt"), "keep");
	database.sqlite.close();
	const { stdout } = await exec(
		process.execPath,
		["scripts/reset-password.mjs"],
		{
			cwd: process.cwd(),
			env: { ...process.env, STATE_DIR: state, LOGGER_LEVEL: "silent" },
		},
	);
	const password = /^Password: ([A-Za-z0-9_-]{32})$/m.exec(stdout)?.[1];
	if (!password) throw new Error("Reset command did not output a password");
	database = openDatabase(path.join(state, "state.db"));
	const settings = await initializeAdministrator(database, vi.fn());
	expect(await verifyPassword(password, settings.passwordHash)).toBe(true);
	expect(settings.secret).not.toBe(initial.secret);
	expect(fs.readFileSync(path.join(state, "files/keep.txt"), "utf8")).toBe(
		"keep",
	);
});
it("refuses to reset an uninitialized state without creating a database", async () => {
	const empty = path.join(root, "empty");
	fs.mkdirSync(empty);
	await expect(
		exec(process.execPath, ["scripts/reset-password.mjs"], {
			cwd: process.cwd(),
			env: { ...process.env, STATE_DIR: empty },
		}),
	).rejects.toThrow();
	expect(fs.readdirSync(empty)).toEqual([]);
});

it("persists a password hash only when the expected credentials still match", async () => {
	const { replaceAdministratorPassword } = await import(
		"../server/administrator.server"
	);
	const { hashPassword } = await import("../server/password.server");
	const before = await initializeAdministrator(database, vi.fn());
	const next = await hashPassword("new-password");
	expect(
		replaceAdministratorPassword(database, before.passwordHash, next),
	).toBe(true);
	expect(
		replaceAdministratorPassword(
			database,
			before.passwordHash,
			await hashPassword("another-password"),
		),
	).toBe(false);
	const after = await initializeAdministrator(database, vi.fn());
	expect(await verifyPassword("new-password", after.passwordHash)).toBe(true);
	expect(after.secret).toBe(before.secret);
});
