import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";

const initialState = await fs.mkdtemp(
	path.join(os.tmpdir(), "sharebox-transfer-state-"),
);
process.env.STATE_DIR = initialState;
process.env.LOGGER_LEVEL = "silent";
const { CONFIG } = await import("../server/config.server");
const { prepareFileAction } = await import("../server/file-actions.server");
const { handleTransferAction } = await import(
	"../server/transfer-action.server"
);
const { transferEntry } = await import("../server/files/transfer.server");
let root: string;
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "sharebox-transfer-"));
	CONFIG.filesDir = path.join(root, "files");
	CONFIG.adminHost = "";
	await fs.mkdir(CONFIG.filesDir);
	await fs.mkdir(path.join(CONFIG.filesDir, "target"));
	await fs.mkdir(path.join(CONFIG.filesDir, "source/sub"), { recursive: true });
	await fs.writeFile(
		path.join(CONFIG.filesDir, "source/sub/a.txt"),
		"contents",
	);
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});
afterAll(async () => {
	await fs.rm(initialState, { recursive: true, force: true });
});
async function submit(
	operation: "move" | "copy",
	source: string,
	destination: string,
) {
	const request = new Request(`http://localhost/files/${operation}`, {
		method: "POST",
		headers: { Origin: "http://localhost" },
		body: new URLSearchParams({ path: source, destination }),
	});
	const prepared = await prepareFileAction(request, operation);
	if (!prepared.ok) throw new Error("Unexpected preparation failure");
	return handleTransferAction(prepared.context, operation);
}
it.each(["move", "copy"] as const)(
	"%s handles nested folders and preserves contents",
	async (operation) => {
		const before = await fs.stat(
			path.join(CONFIG.filesDir, "source/sub/a.txt"),
		);
		expect((await submit(operation, "source", "target")).success).toBe(true);
		expect(
			await fs.readFile(
				path.join(CONFIG.filesDir, "target/source/sub/a.txt"),
				"utf8",
			),
		).toBe("contents");
		const after = await fs.stat(
			path.join(CONFIG.filesDir, "target/source/sub/a.txt"),
		);
		if (operation === "move") {
			expect(after.ino).toBe(before.ino);
			await expect(
				fs.stat(path.join(CONFIG.filesDir, "source")),
			).rejects.toMatchObject({ code: "ENOENT" });
		} else {
			expect(after.ino).not.toBe(before.ino);
			expect(
				await fs.readFile(
					path.join(CONFIG.filesDir, "source/sub/a.txt"),
					"utf8",
				),
			).toBe("contents");
		}
	},
);
it.each(["move", "copy"] as const)(
	"%s handles files and the root destination",
	async (operation) => {
		const before = await fs.stat(
			path.join(CONFIG.filesDir, "source/sub/a.txt"),
		);
		const result = await submit(operation, "source/sub/a.txt", "");
		expect(result.success).toBe(true);
		expect(await fs.readFile(path.join(CONFIG.filesDir, "a.txt"), "utf8")).toBe(
			"contents",
		);
		const after = await fs.stat(path.join(CONFIG.filesDir, "a.txt"));
		expect(after.ino === before.ino).toBe(operation === "move");
		expect(result.change).toEqual(
			operation === "move"
				? { kind: "rename", fromPath: "source/sub/a.txt", toPath: "a.txt" }
				: undefined,
		);
	},
);
it.each(["move", "copy"] as const)(
	"%s refuses existing files and folders without modifying either",
	async (operation) => {
		await fs.writeFile(path.join(CONFIG.filesDir, "target/a.txt"), "keep");
		expect(
			(await submit(operation, "source/sub/a.txt", "target")).error,
		).toContain("already exists");
		expect(
			await fs.readFile(path.join(CONFIG.filesDir, "target/a.txt"), "utf8"),
		).toBe("keep");
		expect(
			await fs.readFile(path.join(CONFIG.filesDir, "source/sub/a.txt"), "utf8"),
		).toBe("contents");
		await fs.mkdir(path.join(CONFIG.filesDir, "target/source"));
		expect((await submit(operation, "source", "target")).error).toContain(
			"already exists",
		);
	},
);
it.each(["move", "copy"] as const)(
	"%s rejects self, descendants and unchanged parent",
	async (operation) => {
		for (const destination of ["source", "source/sub", ""]) {
			expect((await submit(operation, "source", destination)).error).toBe(
				"Select a different folder outside the source folder.",
			);
		}
		expect(
			await fs.readFile(path.join(CONFIG.filesDir, "source/sub/a.txt"), "utf8"),
		).toBe("contents");
	},
);
it.each(["move", "copy"] as const)(
	"%s rejects traversal, missing entries and symbolic links",
	async (operation) => {
		await fs.symlink(root, path.join(CONFIG.filesDir, "link"));
		for (const [source, destination] of [
			["../outside", "target"],
			["source", "../outside"],
			["source", "/tmp"],
			["source", "missing"],
			["source", "link"],
			["link", "target"],
			["source", "source/sub/a.txt"],
			["missing", "target"],
			["", "target"],
		]) {
			expect(
				(await submit(operation, source, destination)).error,
			).toBeDefined();
		}
	},
);
it("removes an incomplete copied folder when a nested symlink is encountered", async () => {
	await fs.symlink(root, path.join(CONFIG.filesDir, "source/link"));
	expect((await submit("copy", "source", "target")).error).toContain(
		"Symbolic links",
	);
	await expect(
		fs.lstat(path.join(CONFIG.filesDir, "target/source")),
	).rejects.toMatchObject({ code: "ENOENT" });
	expect(
		await fs.readFile(path.join(CONFIG.filesDir, "source/sub/a.txt"), "utf8"),
	).toBe("contents");
});
it.each(["move", "copy"] as const)(
	"%s permits only one competing destination file",
	async (operation) => {
		await fs.mkdir(path.join(CONFIG.filesDir, "other"));
		await fs.writeFile(path.join(CONFIG.filesDir, "other/a.txt"), "other");
		const results = await Promise.allSettled([
			transferEntry(CONFIG.filesDir, "source/sub/a.txt", "target", operation),
			transferEntry(CONFIG.filesDir, "other/a.txt", "target", operation),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(["contents", "other"]).toContain(
			await fs.readFile(path.join(CONFIG.filesDir, "target/a.txt"), "utf8"),
		);
	},
);
it.each(["move", "copy"] as const)(
	"%s validates forms, origins and methods",
	async (operation) => {
		for (const request of [
			new Request("http://localhost/"),
			new Request("http://localhost/", {
				method: "POST",
				headers: { Origin: "https://evil.example" },
			}),
		])
			expect((await prepareFileAction(request, operation)).ok).toBe(false);
		const form = new FormData();
		const logger = (await import("../server/logger.server")).logger;
		expect(
			(await handleTransferAction({ form, requestLogger: logger }, operation))
				.error,
		).toContain("Invalid form");
		form.set("path", "source");
		form.set("destination", "target");
		form.set("file", new File(["text"], "test.txt"));
		expect(
			(await handleTransferAction({ form, requestLogger: logger }, operation))
				.error,
		).toContain("Invalid form");
	},
);
it("rolls back a file move when removing its source fails", async () => {
	const unlink = vi.spyOn(fs, "unlink");
	unlink.mockRejectedValueOnce(
		Object.assign(new Error("permission denied"), { code: "EACCES" }),
	);
	expect((await submit("move", "source/sub/a.txt", "target")).error).toContain(
		"permissions",
	);
	expect(
		await fs.readFile(path.join(CONFIG.filesDir, "source/sub/a.txt"), "utf8"),
	).toBe("contents");
	await expect(
		fs.lstat(path.join(CONFIG.filesDir, "target/a.txt")),
	).rejects.toMatchObject({ code: "ENOENT" });
});
it("removes the reserved directory when rename fails", async () => {
	vi.spyOn(fs, "rename").mockRejectedValueOnce(
		Object.assign(new Error("cross-device"), { code: "EXDEV" }),
	);
	expect((await submit("move", "source", "target")).error).toContain(
		"filesystems",
	);
	await expect(
		fs.lstat(path.join(CONFIG.filesDir, "target/source")),
	).rejects.toMatchObject({ code: "ENOENT" });
	expect(
		await fs.readFile(path.join(CONFIG.filesDir, "source/sub/a.txt"), "utf8"),
	).toBe("contents");
});
