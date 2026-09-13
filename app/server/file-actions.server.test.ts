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

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

process.env.DATA_DIR = process.cwd();
process.env.LOGGER_LEVEL = "silent";

const { CONFIG } = await import("./config.server");
const { handleFileAction } = await import("./file-actions.server");
const originalDataDir = CONFIG.datadir;

function actionRequest(formData: FormData): Request {
	return new Request("http://localhost/", {
		method: "POST",
		body: formData,
	});
}

describe("file actions", () => {
	let rootDir: string;

	beforeEach(async () => {
		rootDir = await mkdtemp(path.join(os.tmpdir(), "sharebox-actions-"));
		CONFIG.datadir = rootDir;
	});

	afterEach(async () => {
		await rm(rootDir, { recursive: true, force: true });
	});

	afterAll(() => {
		CONFIG.datadir = originalDataDir;
	});

	it("uploads a file to the configured data directory", async () => {
		const formData = new FormData();
		formData.set("intent", "upload");
		formData.set("file", new File(["hello"], "hello.txt"));

		await expect(handleFileAction(actionRequest(formData))).resolves.toEqual({
			success: true,
		});
		await expect(
			readFile(path.join(rootDir, "hello.txt"), "utf8"),
		).resolves.toBe("hello");
	});

	it("rejects an upload without a file", async () => {
		const formData = new FormData();
		formData.set("intent", "upload");

		await expect(handleFileAction(actionRequest(formData))).resolves.toEqual({
			error: "No file uploaded",
		});
	});

	it("rejects an invalid upload file name", async () => {
		const formData = new FormData();
		formData.set("intent", "upload");
		formData.set("file", new File(["content"], "../outside.txt"));

		await expect(handleFileAction(actionRequest(formData))).resolves.toEqual({
			error: "Invalid file name",
		});
	});

	it("returns an upload error when the data directory is unavailable", async () => {
		CONFIG.datadir = path.join(rootDir, "missing");
		const formData = new FormData();
		formData.set("intent", "upload");
		formData.set("file", new File(["content"], "file.txt"));

		await expect(handleFileAction(actionRequest(formData))).resolves.toEqual({
			error: "上传失败，请检查存储空间和目录权限后重试。",
		});
	});

	it("removes a file", async () => {
		const filePath = path.join(rootDir, "remove.txt");
		await writeFile(filePath, "content");
		const formData = new FormData();
		formData.set("intent", "remove");
		formData.set("path", "remove.txt");

		await expect(handleFileAction(actionRequest(formData))).resolves.toEqual({
			success: true,
		});
		await expect(stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("reports a missing removal target", async () => {
		const formData = new FormData();
		formData.set("intent", "remove");
		formData.set("path", "missing.txt");

		await expect(handleFileAction(actionRequest(formData))).resolves.toEqual({
			error: "File or directory no longer exists",
		});
	});

	it("does not remove a non-empty directory", async () => {
		await mkdir(path.join(rootDir, "not-empty"));
		await writeFile(path.join(rootDir, "not-empty", "file.txt"), "content");
		const formData = new FormData();
		formData.set("intent", "remove");
		formData.set("path", "not-empty");

		await expect(handleFileAction(actionRequest(formData))).resolves.toEqual({
			error: "Directory is not empty",
		});
	});

	it("rejects a removal path outside the data directory", async () => {
		const formData = new FormData();
		formData.set("intent", "remove");
		formData.set("path", "../outside.txt");

		await expect(handleFileAction(actionRequest(formData))).resolves.toEqual({
			error: "Invalid file path",
		});
	});

	it("rejects unsupported actions", async () => {
		const formData = new FormData();
		formData.set("intent", "rename");

		await expect(handleFileAction(actionRequest(formData))).resolves.toEqual({
			error: "Invalid action",
		});
	});

	it("rejects malformed multipart form data", async () => {
		const request = new Request("http://localhost/", {
			method: "POST",
			headers: { "content-type": "multipart/form-data" },
			body: "invalid",
		});

		await expect(handleFileAction(request)).resolves.toEqual({
			error: "Invalid form data",
		});
	});
});
