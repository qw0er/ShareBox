import { execFile } from "node:child_process";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it } from "vitest";

const run = promisify(execFile);

let root: string;
let state: string;

beforeEach(async () => {
	root = await mkdtemp(path.join(os.tmpdir(), "sharebox-migrate-"));
	state = path.join(root, "state");
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

function migrate(args: string[] = []) {
	return run(process.execPath, ["scripts/migrate-state.mjs", ...args], {
		env: { ...process.env, STATE_DIR: state, LOGGER_LEVEL: "silent" },
	});
}

async function exists(target: string) {
	try {
		await stat(target);
		return true;
	} catch {
		return false;
	}
}

it("moves the legacy public layout into a private layout", async () => {
	await mkdir(path.join(state, "data"), { recursive: true });
	await writeFile(path.join(state, "data", "keep.txt"), "keep");
	await mkdir(path.join(state, "tmp", "tus"), { recursive: true });
	await mkdir(path.join(state, "tmp", "tus-receipts"), { recursive: true });
	await writeFile(path.join(state, "tmp", "tus", "partial"), "partial");
	await writeFile(
		path.join(state, "tmp", "tus-receipts", "receipt"),
		"receipt",
	);

	const { stdout } = await migrate();
	expect(stdout).toContain("move");
	expect(await readFile(path.join(state, "files", "keep.txt"), "utf8")).toBe(
		"keep",
	);
	expect(
		await readFile(path.join(state, "staging", "tus", "partial"), "utf8"),
	).toBe("partial");
	expect(
		await readFile(
			path.join(state, "staging", "tus-receipts", "receipt"),
			"utf8",
		),
	).toBe("receipt");
	expect(await exists(path.join(state, "data"))).toBe(false);
	expect((await stat(path.join(state, "files"))).mode & 0o777).toBe(0o700);
	expect((await stat(path.join(state, "staging"))).mode & 0o777).toBe(0o700);

	const second = await migrate();
	expect(second.stdout).toContain("already using the private layout");
});

it("does not change anything in dry-run mode", async () => {
	await mkdir(path.join(state, "data"), { recursive: true });
	await writeFile(path.join(state, "data", "keep.txt"), "keep");

	const { stdout } = await migrate(["--dry-run"]);
	expect(stdout).toContain("[dry-run]");
	expect(await exists(path.join(state, "data"))).toBe(true);
	expect(await exists(path.join(state, "files"))).toBe(false);
});

it("refuses an ambiguous layout", async () => {
	await mkdir(path.join(state, "data"), { recursive: true });
	await mkdir(path.join(state, "files"), { recursive: true });

	await expect(migrate()).rejects.toMatchObject({
		stderr: expect.stringContaining("both legacy data and current files"),
	});
});

it("reports a fresh state without creating directories", async () => {
	await mkdir(state, { recursive: true });
	const { stdout } = await migrate();
	expect(stdout).toContain("no legacy layout found");
	expect(await exists(path.join(state, "files"))).toBe(false);
	expect(await exists(path.join(state, "staging"))).toBe(false);
});
