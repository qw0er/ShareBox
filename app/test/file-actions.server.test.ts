import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

const initialState = await mkdtemp(
	path.join(os.tmpdir(), "sharebox-test-state-"),
);
process.env.STATE_DIR = initialState;
delete process.env.DATA_DIR;
delete process.env.UPLOAD_TMP_DIR;
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
			error: "操作表单无效，请刷新页面后重试。",
		});
	});

	it("reports a missing removal target", async () => {
		const form = new FormData();
		form.set("intent", "remove");
		form.set("path", "missing.txt");

		await expect(handleFileAction(await actionRequest(form))).resolves.toEqual({
			error: "文件或文件夹已不存在，请刷新列表。",
		});
	});

	it("does not remove a non-empty directory", async () => {
		await mkdir(path.join(CONFIG.datadir, "not-empty"));
		await writeFile(
			path.join(CONFIG.datadir, "not-empty", "file.txt"),
			"content",
		);
		const form = new FormData();
		form.set("intent", "remove");
		form.set("path", "not-empty");

		await expect(handleFileAction(await actionRequest(form))).resolves.toEqual({
			error: "文件夹不为空，请先删除其中的内容。",
		});
	});

	it.each(["", "../outside.txt", "/tmp/outside.txt"])(
		"rejects invalid removal path %j",
		async (pathValue) => {
			const form = new FormData();
			form.set("intent", "remove");
			form.set("path", pathValue);

			await expect(
				handleFileAction(await actionRequest(form)),
			).resolves.toEqual({
				error: "文件路径无效，请刷新列表后重试。",
			});
		},
	);

	it("renames a file and preserves its contents", async () => {
		await writeFile(path.join(CONFIG.datadir, "old.txt"), "contents");
		const form = new FormData();
		form.set("intent", "rename");
		form.set("path", "old.txt");
		form.set("newName", "new.txt");
		expect(await handleFileAction(await actionRequest(form))).toEqual({
			success: true,
		});
		expect(await readFile(path.join(CONFIG.datadir, "new.txt"), "utf8")).toBe(
			"contents",
		);
	});
	it.each(["", "../outside.txt", "folder/new.txt", ".."])(
		"rejects unsafe rename name %j",
		async (newName) => {
			await writeFile(path.join(CONFIG.datadir, "old.txt"), "contents");
			const form = new FormData();
			form.set("intent", "rename");
			form.set("path", "old.txt");
			form.set("newName", newName);
			expect(await handleFileAction(await actionRequest(form))).toEqual({
				error: "文件名无效，请输入有效的新名称。",
			});
			expect(await readFile(path.join(CONFIG.datadir, "old.txt"), "utf8")).toBe(
				"contents",
			);
		},
	);
	it("rejects a rename outside the data tree or through a symbolic link", async () => {
		await writeFile(path.join(rootDir, "outside.txt"), "contents");
		await symlink(rootDir, path.join(CONFIG.datadir, "link"));
		for (const target of ["../outside.txt", "link/outside.txt"]) {
			const form = new FormData();
			form.set("intent", "rename");
			form.set("path", target);
			form.set("newName", "new.txt");
			expect(
				(await handleFileAction(await actionRequest(form))).error,
			).toBeDefined();
		}
		expect(await readFile(path.join(rootDir, "outside.txt"), "utf8")).toBe(
			"contents",
		);
	});
	it("does not expose parser errors to the user", async () => {
		const request = new Request("http://localhost/", {
			method: "POST",
			headers: {
				origin: "http://localhost",
				"Content-Type": "multipart/form-data",
			},
			body: "broken",
		});
		expect(await handleFileAction(request)).toEqual({
			error: "无法读取操作表单，请刷新页面后重试。",
		});
	});
	it.each(["constructor", "__proto__"])(
		"rejects inherited action name %s",
		async (intent) => {
			const form = new FormData();
			form.set("intent", intent);
			expect(await handleFileAction(await actionRequest(form))).toEqual({
				error: "不支持此操作，请刷新页面后重试。",
			});
		},
	);

	it("rejects unsupported actions", async () => {
		const form = new FormData();
		form.set("intent", "upload");

		await expect(handleFileAction(await actionRequest(form))).resolves.toEqual({
			error: "不支持此操作，请刷新页面后重试。",
		});
	});

	it.each(["PUT", "PATCH", "DELETE"])(
		"rejects %s before reading the body",
		async (method) => {
			const request = new Request("http://localhost/", { method });
			expect(await handleFileAction(request)).toEqual({
				error: "此操作仅支持提交表单，请刷新页面后重试。",
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
			error: "请求来源无效，请从本站页面重新操作。",
		});
	});
});

afterAll(async () => {
	await rm(initialState, { recursive: true, force: true });
});
