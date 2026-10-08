import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { userDataDir } from "platformdirs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let root: string;
beforeEach(async () => {
	vi.resetModules();
	root = await mkdtemp(path.join(os.tmpdir(), "sharebox-config-"));
	vi.stubEnv("STATE_DIR", path.join(root, "state"));
	vi.stubEnv("PROD", false);
	vi.stubEnv("USER_URL", undefined);
	vi.stubEnv("DATA_DIR", undefined);
	vi.stubEnv("UPLOAD_TMP_DIR", undefined);
	vi.stubEnv("LOGGER_LEVEL", "silent");
	vi.stubEnv("MAX_UPLOAD_BYTES", "1073741824");
});
afterEach(async () => {
	vi.unstubAllEnvs();
	await rm(root, { recursive: true, force: true });
});
it("reads the configured upload limit", async () => {
	vi.stubEnv("MAX_UPLOAD_BYTES", "42");
	expect((await import("../server/config.server")).CONFIG.maxUploadBytes).toBe(
		42,
	);
});
it.each(["0", "-1", "1.5", "abc", "9007199254740991"])(
	"rejects invalid upload limit %s",
	async (value) => {
		vi.stubEnv("MAX_UPLOAD_BYTES", value);
		await expect(import("../server/config.server")).rejects.toThrow(
			"MAX_UPLOAD_BYTES",
		);
	},
);
it("rejects a symbolic state root", async () => {
	await mkdir(path.join(root, "real"));
	await symlink(path.join(root, "real"), path.join(root, "link"));
	vi.stubEnv("STATE_DIR", path.join(root, "link"));
	await expect(import("../server/config.server")).rejects.toThrow(
		"not a directory",
	);
});

it("defaults to 10 GiB per file", async () => {
	vi.stubEnv("MAX_UPLOAD_BYTES", "");
	expect((await import("../server/config.server")).CONFIG.maxUploadBytes).toBe(
		10 * 1024 ** 3,
	);
});

it("creates the complete layout from a single state directory", async () => {
	const { CONFIG } = await import("../server/config.server");
	const resolvedRoot = await realpath(path.join(root, "state"));
	expect(CONFIG.datadir).toBe(path.join(resolvedRoot, "data"));
	expect(CONFIG.tempdir).toBe(path.join(resolvedRoot, "tmp"));
	for (const dir of [
		CONFIG.datadir,
		CONFIG.tempdir,
		path.join(CONFIG.tempdir, "tus"),
		path.join(CONFIG.tempdir, "tus-receipts"),
	]) {
		expect((await stat(dir)).isDirectory()).toBe(true);
	}
	expect((await stat(CONFIG.datadir)).mode & 0o777).toBe(0o755);
	for (const name of ["tmp", "tmp/tus", "tmp/tus-receipts"]) {
		expect((await stat(path.join(root, "state", name))).mode & 0o777).toBe(
			0o700,
		);
	}
});

it("keeps existing files and upload state across startup", async () => {
	const { CONFIG } = await import("../server/config.server");
	await writeFile(path.join(CONFIG.datadir, "keep.txt"), "public");
	await writeFile(
		path.join(CONFIG.tempdir, "tus", "partial"),
		"partial upload",
	);
	await writeFile(
		path.join(CONFIG.tempdir, "tus-receipts", "receipt"),
		"receipt",
	);
	await chmod(CONFIG.tempdir, 0o755);
	vi.resetModules();
	await import("../server/config.server");
	expect(await readFile(path.join(CONFIG.datadir, "keep.txt"), "utf8")).toBe(
		"public",
	);
	expect(
		await readFile(path.join(CONFIG.tempdir, "tus", "partial"), "utf8"),
	).toBe("partial upload");
	expect(
		await readFile(
			path.join(CONFIG.tempdir, "tus-receipts", "receipt"),
			"utf8",
		),
	).toBe("receipt");
	expect((await stat(CONFIG.tempdir)).mode & 0o777).toBe(0o700);
});

it.each(["data", "tmp", "tmp/tus", "tmp/tus-receipts"])(
	"rejects a symbolic internal directory %s without changing its target",
	async (name) => {
		const state = path.join(root, "state");
		const outside = path.join(root, "outside");
		await mkdir(path.dirname(path.join(state, name)), { recursive: true });
		await mkdir(outside, { mode: 0o755 });
		await writeFile(path.join(outside, "keep"), "keep");
		await symlink(outside, path.join(state, name));
		await expect(import("../server/config.server")).rejects.toThrow(
			"not a directory",
		);
		expect((await stat(outside)).mode & 0o777).toBe(0o755);
		expect(await readFile(path.join(outside, "keep"), "utf8")).toBe("keep");
	},
);

it.each(["data", "tmp"])(
	"rejects an internal file at %s without removing it",
	async (name) => {
		await mkdir(path.join(root, "state"));
		const file = path.join(root, "state", name);
		await writeFile(file, "keep");
		await expect(import("../server/config.server")).rejects.toThrow(
			"not a directory",
		);
		expect(await readFile(file, "utf8")).toBe("keep");
	},
);

it.each(["DATA_DIR", "UPLOAD_TMP_DIR"])(
	"rejects obsolete %s configuration with migration guidance",
	async (name) => {
		vi.stubEnv(name, root);
		await expect(import("../server/config.server")).rejects.toThrow(
			"set STATE_DIR",
		);
	},
);

it("validates the upload limit before creating storage", async () => {
	vi.stubEnv("MAX_UPLOAD_BYTES", "0");
	await expect(import("../server/config.server")).rejects.toThrow(
		"MAX_UPLOAD_BYTES",
	);
	await expect(stat(path.join(root, "state"))).rejects.toMatchObject({
		code: "ENOENT",
	});
});

// Runtime configuration tests must not load the developer's private .env.
vi.mock("node:process", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:process")>()),
	loadEnvFile: vi.fn(),
}));

it.each([undefined, ""])(
	"uses the platform data directory when STATE_DIR is %s",
	async (value) => {
		vi.stubEnv("STATE_DIR", value);
		const storage = await import("../server/storage.server");
		const initializer = vi.spyOn(storage, "initializeStorage").mockReturnValue({
			stateDir: root,
			datadir: path.join(root, "data"),
			tempdir: path.join(root, "tmp"),
		});
		try {
			await import("../server/config.server");
			expect(initializer).toHaveBeenCalledWith(userDataDir("sharebox", false));
		} finally {
			initializer.mockRestore();
		}
	},
);

it.each([
	["admin.example.com", "admin.example.com"],
	[" ADMIN.EXAMPLE.COM ", "admin.example.com"],
	["admin.example.com:443", "admin.example.com"],
	["admin.example.com:8443", "admin.example.com:8443"],
])("reads runtime USER_URL %s in production", async (value, expected) => {
	vi.stubEnv("PROD", true);
	vi.stubEnv("USER_URL", value);
	expect((await import("../server/config.server")).CONFIG.adminHost).toBe(
		expected,
	);
});

it.each([
	undefined,
	"",
	"https://admin.example.com",
	"admin.example.com/path",
	"admin.example.com?query",
	"admin.example.com#hash",
	"user@admin.example.com",
	"admin example.com",
	"*.example.com",
	"admin.example.com:0",
	"admin.example.com:65536",
])(
	"rejects invalid production USER_URL %s before creating storage",
	async (value) => {
		vi.stubEnv("PROD", true);
		vi.stubEnv("USER_URL", value);
		await expect(import("../server/config.server")).rejects.toThrow(
			"USER_URL is required in production",
		);
		await expect(stat(path.join(root, "state"))).rejects.toMatchObject({
			code: "ENOENT",
		});
	},
);

it("keeps local development origin checks tied to the request URL", async () => {
	vi.stubEnv("USER_URL", "admin.example.com");
	expect((await import("../server/config.server")).CONFIG.adminHost).toBe("");
});
