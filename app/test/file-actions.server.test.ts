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
const { handleMkdirAction } = await import("../server/mkdir-action.server");
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

async function contextFor(
	request: Request,
	operation: "remove" | "rename" | "mkdir",
) {
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

	async function submitMkdir(parent: string, name: string) {
		const form = new FormData();
		form.set("path", parent);
		form.set("name", name);
		return handleMkdirAction(
			await contextFor(await actionRequest(form), "mkdir"),
		);
	}
	it("creates private folders at root and inside an existing folder", async () => {
		expect(await submitMkdir("", "Documents")).toEqual({ success: true });
		expect(await submitMkdir("Documents", "工作")).toEqual({ success: true });
		const created = await stat(path.join(CONFIG.filesDir, "Documents", "工作"));
		expect(created.isDirectory()).toBe(true);
		expect(created.mode & 0o777).toBe(0o700);
	});
	it("rejects duplicate folders and existing files without changing contents", async () => {
		await mkdir(path.join(CONFIG.filesDir, "existing"));
		await writeFile(path.join(CONFIG.filesDir, "file.txt"), "keep");
		for (const name of ["existing", "file.txt"]) {
			expect(await submitMkdir("", name)).toEqual({
				error:
					"A file or folder with this name already exists. Choose another name.",
			});
		}
		expect(await readFile(path.join(CONFIG.filesDir, "file.txt"), "utf8")).toBe(
			"keep",
		);
	});
	it.each(["", " ", ".", "..", "../escape", "a/b", "a\\b", "a\0b"])(
		"rejects invalid folder name %j",
		async (name) => {
			expect(await submitMkdir("", name)).toEqual({
				error: "Invalid filename. Enter a valid name.",
			});
		},
	);
	it.each(["../outside", "/tmp", "a/../b", "a\\b"])(
		"rejects unsafe parent %j",
		async (parent) => {
			expect(await submitMkdir(parent, "new")).toEqual({
				error: "Invalid file path. Refresh the list and try again.",
			});
		},
	);
	it("rejects missing parents, files as parents, and linked parents", async () => {
		await writeFile(path.join(CONFIG.filesDir, "file.txt"), "keep");
		await symlink(rootDir, path.join(CONFIG.filesDir, "link"));
		for (const parent of ["missing", "file.txt", "link"]) {
			expect((await submitMkdir(parent, "new")).error).toBeDefined();
		}
		await expect(stat(path.join(rootDir, "new"))).rejects.toMatchObject({
			code: "ENOENT",
		});
	});
	it("does not follow a symlink at the new folder path", async () => {
		await symlink(rootDir, path.join(CONFIG.filesDir, "link"));
		expect((await submitMkdir("", "link")).error).toContain("already exists");
	});
	it("rejects malformed folder forms", async () => {
		const missingPath = new FormData();
		missingPath.set("name", "new");
		const missingName = new FormData();
		missingName.set("path", "");
		for (const form of [missingPath, missingName]) {
			expect(
				(
					await handleMkdirAction(
						await contextFor(await actionRequest(form), "mkdir"),
					)
				).error,
			).toBeDefined();
		}
		const form = new FormData();
		form.set("path", "");
		form.set("name", "new");
		form.set("file", new File(["text"], "test.txt"));
		expect(
			await handleMkdirAction(
				await contextFor(await actionRequest(form), "mkdir"),
			),
		).toEqual({ error: "Invalid form. Refresh the page and try again." });
	});
	it("enforces POST and same-origin for folder creation", async () => {
		for (const request of [
			new Request("http://localhost/files/mkdir"),
			new Request("http://localhost/files/mkdir", {
				method: "POST",
				headers: { Origin: "https://evil.example" },
			}),
		]) {
			expect((await prepareFileAction(request, "mkdir")).ok).toBe(false);
		}
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
