import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let root: string;
beforeEach(async () => {
	vi.resetModules();
	root = await mkdtemp(path.join(os.tmpdir(), "sharebox-config-"));
	vi.stubEnv("DATA_DIR", root);
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
it("rejects a symbolic data root", async () => {
	await mkdir(path.join(root, "real"));
	await symlink(path.join(root, "real"), path.join(root, "link"));
	vi.stubEnv("DATA_DIR", path.join(root, "link"));
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
