import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

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
		CONFIG.tempdir = path.join(rootDir, "tmp");
		CONFIG.maxUploadBytes = 1024;
		CONFIG.adminHost = "";
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await rm(rootDir, { recursive: true, force: true });
	});

	afterAll(() => {
		CONFIG.datadir = originalDataDir;
	});

	it("uploads a file to the configured data directory", async () => {
		const formData = new FormData();
		formData.set("intent", "upload");
		formData.set("file", new File(["hello"], "hello.txt"));

		await expect(
			handleFileAction(await actionRequest(formData)),
		).resolves.toEqual({
			success: true,
		});
		await expect(
			readFile(path.join(CONFIG.datadir, "hello.txt"), "utf8"),
		).resolves.toBe("hello");
	});

	it("rejects an upload without a file", async () => {
		const formData = new FormData();
		formData.set("intent", "upload");

		await expect(
			handleFileAction(await actionRequest(formData)),
		).resolves.toEqual({
			error: "No file uploaded",
		});
	});

	it("rejects an invalid upload file name", async () => {
		const formData = new FormData();
		formData.set("intent", "upload");
		formData.set("file", new File(["content"], "../outside.txt"));

		await expect(
			handleFileAction(await actionRequest(formData)),
		).resolves.toEqual({
			error: "Invalid file name",
		});
	});

	it("returns an upload error when the data directory is unavailable", async () => {
		CONFIG.datadir = path.join(rootDir, "missing");
		const formData = new FormData();
		formData.set("intent", "upload");
		formData.set("file", new File(["content"], "file.txt"));

		await expect(
			handleFileAction(await actionRequest(formData)),
		).resolves.toEqual({
			error: expect.any(String),
		});
	});

	it("removes a file", async () => {
		const filePath = path.join(CONFIG.datadir, "remove.txt");
		await writeFile(filePath, "content");
		const formData = new FormData();
		formData.set("intent", "remove");
		formData.set("path", "remove.txt");

		await expect(
			handleFileAction(await actionRequest(formData)),
		).resolves.toEqual({
			success: true,
		});
		await expect(stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("reports a missing removal target", async () => {
		const formData = new FormData();
		formData.set("intent", "remove");
		formData.set("path", "missing.txt");

		await expect(
			handleFileAction(await actionRequest(formData)),
		).resolves.toEqual({
			error: "File or directory no longer exists",
		});
	});

	it("does not remove a non-empty directory", async () => {
		await mkdir(path.join(CONFIG.datadir, "not-empty"));
		await writeFile(
			path.join(CONFIG.datadir, "not-empty", "file.txt"),
			"content",
		);
		const formData = new FormData();
		formData.set("intent", "remove");
		formData.set("path", "not-empty");

		await expect(
			handleFileAction(await actionRequest(formData)),
		).resolves.toEqual({
			error: "Directory is not empty",
		});
	});

	it("rejects a removal path outside the data directory", async () => {
		const formData = new FormData();
		formData.set("intent", "remove");
		formData.set("path", "../outside.txt");

		await expect(
			handleFileAction(await actionRequest(formData)),
		).resolves.toEqual({
			error: "Invalid file path",
		});
	});

	it("rejects unsupported actions", async () => {
		const formData = new FormData();
		formData.set("intent", "rename");

		await expect(
			handleFileAction(await actionRequest(formData)),
		).resolves.toEqual({
			error: "Invalid action",
		});
	});

	it("rejects malformed multipart form data", async () => {
		const request = new Request("http://localhost/", {
			method: "POST",
			headers: {
				"content-type": "multipart/form-data",
				origin: "http://localhost",
			},
			body: "invalid",
		});

		await expect(handleFileAction(request)).resolves.toEqual({
			error: expect.any(String),
		});
	});
});

async function uploadRequest(name = "file.txt", content = "hello") {
	const form = new FormData();
	form.set("intent", "upload");
	form.set("file", new File([content], name));
	return actionRequest(form);
}

describe("upload safety", () => {
	let workspace: string;
	beforeEach(async () => {
		workspace = await mkdtemp(
			path.join(os.tmpdir(), "sharebox-upload-safety-"),
		);
		CONFIG.datadir = path.join(workspace, "public");
		CONFIG.tempdir = path.join(workspace, "tmp");
		CONFIG.maxUploadBytes = 8;
		CONFIG.adminHost = "";
		await mkdir(CONFIG.datadir);
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await rm(workspace, { recursive: true, force: true });
	});
	async function cleanTemp() {
		expect(await readdir(CONFIG.tempdir).catch(() => [])).toEqual([]);
	}
	it("does not replace a same-name file", async () => {
		await writeFile(path.join(CONFIG.datadir, "file.txt"), "original");
		expect(await handleFileAction(await uploadRequest())).toHaveProperty(
			"error",
		);
		expect(await readFile(path.join(CONFIG.datadir, "file.txt"), "utf8")).toBe(
			"original",
		);
		await cleanTemp();
	});
	it("publishes only one of two concurrent uploads with the same name", async () => {
		const results = await Promise.all([
			handleFileAction(await uploadRequest("same", "first")),
			handleFileAction(await uploadRequest("same", "second")),
		]);
		expect(results.filter((result) => "success" in result)).toHaveLength(1);
		expect(["first", "second"]).toContain(
			await readFile(path.join(CONFIG.datadir, "same"), "utf8"),
		);
		await cleanTemp();
	});
	it.each([false, true])(
		"rejects existing symbolic links, dangling=%s",
		async (dangling) => {
			const outside = path.join(workspace, "outside");
			if (!dangling) await writeFile(outside, "original");
			await symlink(outside, path.join(CONFIG.datadir, "file.txt"));
			expect(await handleFileAction(await uploadRequest())).toHaveProperty(
				"error",
			);
			if (!dangling) expect(await readFile(outside, "utf8")).toBe("original");
			else
				await expect(stat(outside)).rejects.toMatchObject({ code: "ENOENT" });
			await cleanTemp();
		},
	);
	it("rejects a directory with the upload name", async () => {
		await mkdir(path.join(CONFIG.datadir, "file.txt"));
		expect(await handleFileAction(await uploadRequest())).toHaveProperty(
			"error",
		);
		expect(
			(await stat(path.join(CONFIG.datadir, "file.txt"))).isDirectory(),
		).toBe(true);
		await cleanTemp();
	});
	it("accepts exact limit and rejects limit plus one without public residue", async () => {
		expect(
			await handleFileAction(await uploadRequest("exact", "12345678")),
		).toEqual({ success: true });
		expect(
			await handleFileAction(await uploadRequest("large", "123456789")),
		).toHaveProperty("error");
		expect(await readdir(CONFIG.datadir)).toEqual(["exact"]);
		await cleanTemp();
	});
	it("supports empty files and UTF-8 names", async () => {
		expect(await handleFileAction(await uploadRequest("中文.txt", ""))).toEqual(
			{ success: true },
		);
		expect(await readFile(path.join(CONFIG.datadir, "中文.txt"), "utf8")).toBe(
			"",
		);
	});
	it("rejects multiple file parts before publication", async () => {
		const form = new FormData();
		form.set("intent", "upload");
		form.append("file", new File(["one"], "one"));
		form.append("file", new File(["two"], "two"));
		expect(await handleFileAction(await actionRequest(form))).toHaveProperty(
			"error",
		);
		expect(await readdir(CONFIG.datadir)).toEqual([]);
		await cleanTemp();
	});
	it.each(["PUT", "PATCH", "DELETE"])(
		"rejects %s before reading the body",
		async (method) => {
			const original = await uploadRequest();
			const request = new Request(original, { method });
			expect(await handleFileAction(request)).toEqual({
				error: "Method not allowed",
			});
		},
	);
	it.each([undefined, "https://evil.example"])(
		"rejects origin %s",
		async (origin) => {
			const request = await uploadRequest();
			request.headers.delete("origin");
			if (origin) request.headers.set("origin", origin);
			expect(await handleFileAction(request)).toEqual({
				error: "Invalid request origin",
			});
		},
	);
	it("accepts configured HTTPS origin behind the proxy", async () => {
		CONFIG.adminHost = "admin.example.com";
		const request = await uploadRequest();
		request.headers.set("origin", "https://admin.example.com");
		expect(await handleFileAction(request)).toEqual({ success: true });
	});
	it("rejects temporary directories inside public storage", async () => {
		CONFIG.tempdir = path.join(CONFIG.datadir, "tmp");
		expect(await handleFileAction(await uploadRequest())).toHaveProperty(
			"error",
		);
		expect(await readdir(CONFIG.datadir)).toEqual([]);
	});
	it("does not call buffered Request or File methods", async () => {
		const request = await uploadRequest();
		vi.spyOn(request, "formData").mockRejectedValue(
			new Error("buffering is forbidden"),
		);
		vi.spyOn(File.prototype, "arrayBuffer").mockRejectedValue(
			new Error("buffering is forbidden"),
		);
		expect(await handleFileAction(request)).toEqual({ success: true });
	});
	it("cleans up a truncated multipart upload", async () => {
		const request = await uploadRequest();
		const bytes = new Uint8Array(await request.arrayBuffer());
		const broken = new Request(request.url, {
			method: "POST",
			headers: request.headers,
			body: bytes.slice(0, -15),
		});
		expect(await handleFileAction(broken)).toHaveProperty("error");
		expect(await readdir(CONFIG.datadir)).toEqual([]);
		await cleanTemp();
	});
	it("cleans up when the incoming stream fails", async () => {
		const request = await uploadRequest();
		const bytes = new Uint8Array(await request.arrayBuffer());
		let sent = false;
		const body = new ReadableStream({
			pull(controller) {
				if (!sent) {
					controller.enqueue(bytes.slice(0, -15));
					sent = true;
				} else controller.error(new Error("connection lost"));
			},
		});
		const broken = new Request(request.url, {
			method: "POST",
			headers: request.headers,
			body,
			duplex: "half",
		} as RequestInit);
		expect(await handleFileAction(broken)).toHaveProperty("error");
		expect(await readdir(CONFIG.datadir)).toEqual([]);
		await cleanTemp();
	});
});
