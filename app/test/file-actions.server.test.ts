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
const { prepareFileAction } = await import("../server/file-actions.server");
const { handleRemoveAction } = await import("../server/remove-action.server");
const { handleRenameAction } = await import("../server/rename-action.server");
const originalFilesDir = CONFIG.filesDir;

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

async function contextFor(request: Request, operation: "remove" | "rename") {
	const prepared = await prepareFileAction(request, operation);
	if (!prepared.ok) {
		throw new Error(`Unexpected preparation failure: ${prepared.result.error}`);
	}
	return prepared.context;
}

async function submitRemove(form: FormData) {
	return handleRemoveAction(
		await contextFor(await actionRequest(form), "remove"),
	);
}

async function submitRename(form: FormData) {
	return handleRenameAction(
		await contextFor(await actionRequest(form), "rename"),
	);
}

describe("file actions", () => {
	let rootDir: string;

	beforeEach(async () => {
		rootDir = await mkdtemp(path.join(os.tmpdir(), "sharebox-actions-"));
		CONFIG.filesDir = path.join(rootDir, "files");
		await mkdir(CONFIG.filesDir);
		CONFIG.adminHost = "";
	});

	afterEach(async () => {
		await rm(rootDir, { recursive: true, force: true });
	});

	afterAll(() => {
		CONFIG.filesDir = originalFilesDir;
	});

	it("removes a file", async () => {
		const filePath = path.join(CONFIG.filesDir, "remove.txt");
		await writeFile(filePath, "content");
		const form = new FormData();
		form.set("path", "remove.txt");

		await expect(submitRemove(form)).resolves.toEqual({
			success: true,
			change: { kind: "remove", path: "remove.txt" },
		});
		await expect(stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("rejects files in a removal request", async () => {
		const form = new FormData();
		form.set("path", "remove.txt");
		form.set("file", new File(["content"], "remove.txt"));

		await expect(submitRemove(form)).resolves.toEqual({
			error: "Invalid form. Refresh the page and try again.",
		});
	});

	it("reports a missing removal target", async () => {
		const form = new FormData();
		form.set("path", "missing.txt");

		await expect(submitRemove(form)).resolves.toEqual({
			error: "The file or folder no longer exists. Refresh the list.",
		});
	});

	it("does not remove a non-empty directory", async () => {
		await mkdir(path.join(CONFIG.filesDir, "not-empty"));
		await writeFile(
			path.join(CONFIG.filesDir, "not-empty", "file.txt"),
			"content",
		);
		const form = new FormData();
		form.set("path", "not-empty");

		await expect(submitRemove(form)).resolves.toEqual({
			error: "The folder is not empty. Remove its contents first.",
		});
	});

	it.each(["", "../outside.txt", "/tmp/outside.txt"])(
		"rejects invalid removal path %j",
		async (pathValue) => {
			const form = new FormData();
			form.set("path", pathValue);

			await expect(submitRemove(form)).resolves.toEqual({
				error: "Invalid file path. Refresh the list and try again.",
			});
		},
	);

	it("renames a file and preserves its contents", async () => {
		await writeFile(path.join(CONFIG.filesDir, "old.txt"), "contents");
		const form = new FormData();
		form.set("path", "old.txt");
		form.set("newName", "new.txt");
		expect(await submitRename(form)).toEqual({
			success: true,
			change: { kind: "rename", fromPath: "old.txt", toPath: "new.txt" },
		});
		expect(await readFile(path.join(CONFIG.filesDir, "new.txt"), "utf8")).toBe(
			"contents",
		);
	});
	it("refuses to overwrite an existing rename target", async () => {
		await writeFile(path.join(CONFIG.filesDir, "old.txt"), "old");
		await writeFile(path.join(CONFIG.filesDir, "existing.txt"), "existing");
		const form = new FormData();
		form.set("path", "old.txt");
		form.set("newName", "existing.txt");
		expect(await submitRename(form)).toEqual({
			error:
				"A file or folder with this name already exists. Choose another name.",
		});
		expect(await readFile(path.join(CONFIG.filesDir, "old.txt"), "utf8")).toBe(
			"old",
		);
		expect(
			await readFile(path.join(CONFIG.filesDir, "existing.txt"), "utf8"),
		).toBe("existing");
	});
	it.each(["", "../outside.txt", "folder/new.txt", ".."])(
		"rejects unsafe rename name %j",
		async (newName) => {
			await writeFile(path.join(CONFIG.filesDir, "old.txt"), "contents");
			const form = new FormData();
			form.set("path", "old.txt");
			form.set("newName", newName);
			expect(await submitRename(form)).toEqual({
				error: "Invalid filename. Enter a valid name.",
			});
			expect(
				await readFile(path.join(CONFIG.filesDir, "old.txt"), "utf8"),
			).toBe("contents");
		},
	);
	it("rejects a rename outside the data tree or through a symbolic link", async () => {
		await writeFile(path.join(rootDir, "outside.txt"), "contents");
		await symlink(rootDir, path.join(CONFIG.filesDir, "link"));
		for (const target of ["../outside.txt", "link/outside.txt"]) {
			const form = new FormData();
			form.set("path", target);
			form.set("newName", "new.txt");
			expect((await submitRename(form)).error).toBeDefined();
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
		expect(await prepareFileAction(request, "remove")).toEqual({
			ok: false,
			result: {
				error: "Unable to read the form. Refresh the page and try again.",
			},
		});
	});
	it("prepares the parsed form and operation logger", async () => {
		const form = new FormData();
		form.set("path", "value.txt");

		const prepared = await prepareFileAction(
			await actionRequest(form),
			"remove",
		);
		expect(prepared.ok).toBe(true);
		if (!prepared.ok) throw new Error("Expected prepared file action");
		expect(prepared.context.form.get("path")).toBe("value.txt");
		expect(prepared.context.requestLogger).toBeDefined();
	});
	it.each(["PUT", "PATCH", "DELETE"])(
		"rejects %s before reading the body",
		async (method) => {
			const request = new Request("http://localhost/", { method });
			expect(await prepareFileAction(request, "remove")).toEqual({
				ok: false,
				result: {
					error:
						"This operation requires a form submission. Refresh the page and try again.",
				},
			});
		},
	);

	it("rejects an invalid origin", async () => {
		const form = new FormData();
		form.set("path", "missing.txt");
		const request = await actionRequest(form);
		request.headers.set("origin", "https://evil.example");

		await expect(prepareFileAction(request, "remove")).resolves.toEqual({
			ok: false,
			result: {
				error: "Invalid request origin. Please try again from this site.",
			},
		});
	});
});

afterAll(async () => {
	await rm(initialState, { recursive: true, force: true });
});
