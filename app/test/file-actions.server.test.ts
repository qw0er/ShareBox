import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

process.env.DATA_DIR = process.cwd();
process.env.LOGGER_LEVEL = "silent";

const { CONFIG } = await import("../server/config.server");
const { handleFileAction } = await import("../server/file-actions.server");
const originalDataDir = CONFIG.datadir;

async function actionRequest(formData: FormData): Promise<Request> {
	const encoded = new Request("http://localhost/", {
		method: "POST",
		body: formData,
		headers: { origin: "http://localhost" },
	});
	return new Request(encoded.url, {
		method: "POST",
		headers: encoded.headers,
		body: await encoded.arrayBuffer(),
	});
}

describe("file actions", () => {
	let rootDir: string;

	beforeEach(async () => {
		rootDir = await mkdtemp(path.join(os.tmpdir(), "sharebox-actions-"));
		CONFIG.datadir = path.join(rootDir, "public");
		await mkdir(CONFIG.datadir);
		CONFIG.adminHost = "";
	});

	afterEach(async () => {
		await rm(rootDir, { recursive: true, force: true });
	});

	afterAll(() => {
		CONFIG.datadir = originalDataDir;
	});

	it("removes a file", async () => {
		const filePath = path.join(CONFIG.datadir, "remove.txt");
		await writeFile(filePath, "content");
		const form = new FormData();
		form.set("intent", "remove");
		form.set("path", "remove.txt");

		await expect(handleFileAction(await actionRequest(form))).resolves.toEqual({
			success: true,
		});
		await expect(stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("rejects files in a removal request", async () => {
		const form = new FormData();
		form.set("intent", "remove");
		form.set("path", "remove.txt");
		form.set("file", new File(["content"], "remove.txt"));

		await expect(handleFileAction(await actionRequest(form))).resolves.toEqual({
			error: "Invalid form data",
		});
	});

	it("reports a missing removal target", async () => {
		const form = new FormData();
		form.set("intent", "remove");
		form.set("path", "missing.txt");

		await expect(handleFileAction(await actionRequest(form))).resolves.toEqual({
			error: "File or directory no longer exists",
		});
	});

	it("does not remove a non-empty directory", async () => {
		await mkdir(path.join(CONFIG.datadir, "not-empty"));
		await writeFile(path.join(CONFIG.datadir, "not-empty", "file.txt"), "content");
		const form = new FormData();
		form.set("intent", "remove");
		form.set("path", "not-empty");

		await expect(handleFileAction(await actionRequest(form))).resolves.toEqual({
			error: "Directory is not empty",
		});
	});

	it.each(["", "../outside.txt", "/tmp/outside.txt"])(
		"rejects invalid removal path %j",
		async (pathValue) => {
			const form = new FormData();
			form.set("intent", "remove");
			form.set("path", pathValue);

			await expect(handleFileAction(await actionRequest(form))).resolves.toEqual({
				error: "Invalid file path",
			});
		},
	);

	it("rejects unsupported actions", async () => {
		const form = new FormData();
		form.set("intent", "upload");

		await expect(handleFileAction(await actionRequest(form))).resolves.toEqual({
			error: "Invalid action",
		});
	});

	it.each(["PUT", "PATCH", "DELETE"])(
		"rejects %s before reading the body",
		async (method) => {
			const request = new Request("http://localhost/", { method });
			expect(await handleFileAction(request)).toEqual({
				error: "Method not allowed",
			});
		},
	);

	it("rejects an invalid origin", async () => {
		const form = new FormData();
		form.set("intent", "remove");
		form.set("path", "missing.txt");
		const request = await actionRequest(form);
		request.headers.set("origin", "https://evil.example");

		await expect(handleFileAction(request)).resolves.toEqual({
			error: "Invalid request origin",
		});
	});
});
