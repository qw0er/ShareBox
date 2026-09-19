import {
	copyFile,
	mkdir,
	rename,
	lstat,
	utimes,
	mkdtemp,
	readFile,
	readdir,
	rm,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return {
		...actual,
		copyFile: vi.fn(actual.copyFile),
		rename: vi.fn(actual.rename),
	};
});

process.env.DATA_DIR = process.cwd();
process.env.LOGGER_LEVEL = "silent";
const { createUploadService, UploadService, handleTusRequest } = await import(
	"../server/tus.server"
);
let root: string;
let config: Parameters<typeof createUploadService>[0];
let service: Awaited<ReturnType<typeof createUploadService>>;
beforeEach(async () => {
	root = await mkdtemp(path.join(os.tmpdir(), "sharebox-tus-"));
	await mkdir(path.join(root, "public"));
	config = {
		datadir: path.join(root, "public"),
		tempdir: path.join(root, "tmp"),
		maxUploadBytes: 1024,
		adminHost: "",
		loggerLevel: "silent",
	};
	service = await createUploadService(config);
});
afterEach(async () => {
	await service.dispose();
	vi.restoreAllMocks();
	vi.mocked(copyFile).mockClear();
	vi.mocked(rename).mockClear();
	await rm(root, { recursive: true, force: true });
});
function request(
	method: string,
	url = "/uploads",
	headers: Record<string, string> = {},
	body?: BodyInit,
) {
	return service.handle(
		new Request(`http://localhost${url}`, {
			method,
			headers: {
				origin: "http://localhost",
				"Tus-Resumable": "1.0.0",
				...headers,
			},
			body,
			duplex: "half",
		} as RequestInit),
	);
}
async function create(name = "包.txt", size = 5) {
	const response = await request("POST", "/uploads", {
		"Upload-Length": String(size),
		"Upload-Metadata": `filename ${Buffer.from(name).toString("base64")}`,
	});
	expect(response.status).toBe(201);
	return response.headers.get("Location")!;
}
function patch(url: string, offset: number, body: BodyInit) {
	return request(
		"PATCH",
		url,
		{
			"Upload-Offset": String(offset),
			"Content-Type": "application/offset+octet-stream",
		},
		body,
	);
}
it("resumes across service restarts and publishes once after complete transfer", async () => {
	const url = await create();
	expect((await patch(url, 0, "he")).status).toBe(204);
	expect(await readdir(config!.datadir)).toEqual([]);
	expect((await request("POST", `${url}/complete`)).status).toBe(404);
	service = await createUploadService(config);
	expect((await request("HEAD", url)).headers.get("Upload-Offset")).toBe("2");
	expect((await patch(url, 0, "oops")).status).toBe(409);
	expect((await patch(url, 2, "llo")).status).toBe(204);
	expect((await request("POST", `${url}/complete`)).status).toBe(404);
	expect(await readFile(path.join(config!.datadir, "包.txt"), "utf8")).toBe(
		"hello",
	);
	expect(await readdir(path.join(root, "tmp/tus"))).toEqual([]);
	service = await createUploadService(config);
	const recovered = await request("HEAD", url);
	expect(recovered.status).toBe(200);
	expect(recovered.headers.get("Upload-Offset")).toBe("5");
	expect(recovered.headers.get("Upload-Length")).toBe("5");
	expect(copyFile).toHaveBeenCalledTimes(1);
});
it("retains accepted bytes after a broken request body", async () => {
	const url = await create();
	let controller: ReadableStreamDefaultController<Uint8Array>;
	const body = new ReadableStream<Uint8Array>({
		start(c) {
			controller = c;
			c.enqueue(new TextEncoder().encode("he"));
		},
	});
	const pending = patch(url, 0, body);
	const { vi } = await import("vitest");
	await vi.waitFor(async () =>
		expect(
			await readFile(path.join(root, "tmp/tus", url.split("/").pop()!), "utf8"),
		).toBe("he"),
	);
	controller!.error(new Error("connection lost"));
	expect((await pending).status).toBeGreaterThanOrEqual(400);
	expect((await request("HEAD", url)).headers.get("Upload-Offset")).toBe("2");
	expect((await patch(url, 2, "llo")).status).toBe(204);
});
it("terminates paused uploads without publishing anything", async () => {
	const url = await create();
	await patch(url, 0, "he");
	expect((await request("DELETE", url)).status).toBe(204);
	expect((await request("HEAD", url)).status).toBe(404);
	expect(await readdir(path.join(root, "tmp/tus"))).toEqual([]);
	expect(await readdir(config!.datadir)).toEqual([]);
});
it("rejects names, size limits, cross-origin mutations and unknown IDs", async () => {
	for (const name of ["../escape", ".", "a/b", ""]) {
		expect(
			(
				await request("POST", "/uploads", {
					"Upload-Length": "5",
					"Upload-Metadata": `filename ${Buffer.from(name).toString("base64")}`,
				})
			).status,
		).toBe(400);
	}
	expect(
		(await request("POST", "/uploads", { "Upload-Length": "1025" })).status,
	).toBe(413);
	expect(
		(await request("POST", "/uploads", { origin: "https://evil.example" }))
			.status,
	).toBe(403);
	expect((await request("DELETE", "/uploads/invalid")).status).toBe(404);
});
it("keeps completed data for retry when another upload wins the filename", async () => {
	const first = await create("same.txt");
	const second = await create("same.txt");
	expect((await patch(first, 0, "first")).status).toBe(204);
	expect((await patch(second, 0, "other")).status).toBe(409);
	expect(await readFile(path.join(config!.datadir, "same.txt"), "utf8")).toBe(
		"first",
	);
	expect((await request("HEAD", second)).status).toBe(409);
	expect(
		await readFile(
			path.join(root, "tmp/tus", second.split("/").pop()!),
			"utf8",
		),
	).toBe("other");
	expect((await request("DELETE", second)).status).toBe(204);
});
it("publishes zero-byte files and cleans expired unfinished tasks", async () => {
	const empty = await create("empty", 0);
	expect((await request("HEAD", empty)).headers.get("Upload-Offset")).toBe("0");
	expect((await lstat(path.join(config!.datadir, "empty"))).size).toBe(0);
	expect(await readdir(path.join(root, "tmp/tus"))).toEqual([]);
	const url = await create();
	const infoPath = path.join(root, "tmp/tus", `${url.split("/").pop()}.json`);
	const files = await readdir(path.join(root, "tmp/tus"));
	const metadataPath = path.join(
		root,
		"tmp/tus",
		files.find((f) => f.endsWith(".json")) || path.basename(infoPath),
	);
	const info = JSON.parse(await readFile(metadataPath, "utf8"));
	info.creation_date = new Date(0).toISOString();
	await writeFile(metadataPath, JSON.stringify(info));
	await service.cleanup();
	expect((await request("HEAD", url)).status).toBe(404);
});

it("does not report completed HEAD after a copy failure and recovers without retransmission", async () => {
	const url = await create();
	const copy = vi.mocked(copyFile);
	copy.mockRejectedValueOnce(
		Object.assign(new Error("disk full"), { code: "ENOSPC" }),
	);
	expect((await patch(url, 0, "hello")).status).toBe(500);
	expect(await readdir(config!.datadir)).toEqual([]);
	copy.mockRejectedValueOnce(
		Object.assign(new Error("disk full"), { code: "ENOSPC" }),
	);
	const failed = await request("HEAD", url);
	expect(failed.status).toBe(500);
	expect(failed.headers.get("Upload-Offset")).toBeNull();
	service = await createUploadService(config);
	const recovered = await request("HEAD", url);
	expect(recovered.status).toBe(200);
	expect(recovered.headers.get("Upload-Offset")).toBe("5");
	expect(await readFile(path.join(config!.datadir, "包.txt"), "utf8")).toBe(
		"hello",
	);
	expect(await readdir(path.join(root, "tmp/tus"))).toEqual([]);
});

it("serializes HEAD and DELETE with publication and skips active uploads during cleanup", async () => {
	const url = await create();
	const realCopy = vi.mocked(copyFile).getMockImplementation()!;
	let release!: () => void;
	let entered!: () => void;
	const started = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	vi.mocked(copyFile).mockImplementationOnce(async (...args) => {
		entered();
		await gate;
		return realCopy(...args);
	});
	const patching = patch(url, 0, "hello");
	await started;
	let headDone = false;
	let deleteDone = false;
	const heading = request("HEAD", url).then((res) => {
		headDone = true;
		return res;
	});
	const deleting = request("DELETE", url).then((res) => {
		deleteDone = true;
		return res;
	});
	await service.cleanup();
	expect(headDone).toBe(false);
	expect(deleteDone).toBe(false);
	expect(await readdir(config!.datadir)).toEqual([]);
	release();
	expect((await patching).status).toBe(204);
	expect((await heading).headers.get("Upload-Offset")).toBe("5");
	expect([204, 404]).toContain((await deleting).status);
	expect(await readFile(path.join(config!.datadir, "包.txt"), "utf8")).toBe(
		"hello",
	);
	expect((await request("HEAD", url)).status).toBe(200);
});

it("does not overwrite a copied file if receipt persistence failed", async () => {
	const url = await create();
	vi.mocked(rename).mockRejectedValueOnce(
		Object.assign(new Error("disk full"), { code: "ENOSPC" }),
	);
	expect((await patch(url, 0, "hello")).status).toBe(500);
	service = await createUploadService(config);
	expect((await request("HEAD", url)).status).toBe(409);
	expect(await readFile(path.join(config!.datadir, "包.txt"), "utf8")).toBe(
		"hello",
	);
	expect(
		await readFile(path.join(root, "tmp/tus", url.split("/").pop()!), "utf8"),
	).toBe("hello");
});

it("publishes bytes included in the creation POST before cleaning its source", async () => {
	const response = await request(
		"POST",
		"/uploads",
		{
			"Upload-Length": "5",
			"Upload-Metadata": `filename ${Buffer.from("created.txt").toString("base64")}`,
			"Content-Type": "application/offset+octet-stream",
		},
		"hello",
	);
	expect(response.status).toBe(201);
	const url = response.headers.get("Location")!;
	expect((await request("HEAD", url)).headers.get("Upload-Offset")).toBe("5");
	expect(
		await readFile(path.join(config!.datadir, "created.txt"), "utf8"),
	).toBe("hello");
	expect(await readdir(path.join(root, "tmp/tus"))).toEqual([]);
});

it("deletes a failed receipt's staging file along with the upload", async () => {
	const url = await create();
	vi.mocked(rename).mockRejectedValueOnce(new Error("receipt failure"));
	expect((await patch(url, 0, "hello")).status).toBe(500);
	expect((await readdir(path.join(root, "tmp/tus-receipts"))).length).toBe(1);
	expect((await request("DELETE", url)).status).toBe(204);
	expect(await readdir(path.join(root, "tmp/tus-receipts"))).toEqual([]);
	expect(await readdir(path.join(root, "tmp/tus"))).toEqual([]);
	expect(await readFile(path.join(config!.datadir, "包.txt"), "utf8")).toBe(
		"hello",
	);
});

it("rejects invalid protocol headers even when a completion receipt exists", async () => {
	const url = await create();
	await patch(url, 0, "hello");
	expect(
		(await request("HEAD", url, { "Tus-Resumable": "0.0.0" })).status,
	).toBe(400);
	expect(
		(await request("HEAD", url, { origin: "https://evil.example" })).status,
	).toBe(403);
});

it("expires receipts without deleting public files and supports old receipts", async () => {
	const url = await create();
	await patch(url, 0, "hello");
	const receiptPath = path.join(
		root,
		"tmp/tus-receipts",
		url.split("/").pop()!,
	);
	await writeFile(
		receiptPath,
		JSON.stringify({ success: true, filename: "包.txt" }),
	);
	expect((await request("HEAD", url)).headers.get("Upload-Offset")).toBe("5");
	await utimes(receiptPath, new Date(0), new Date(0));
	expect((await request("HEAD", url)).status).toBe(410);
	await service.cleanup();
	expect(await readdir(path.join(root, "tmp/tus-receipts"))).toEqual([]);
	expect((await request("HEAD", url)).status).toBe(404);
	expect(await readFile(path.join(config!.datadir, "包.txt"), "utf8")).toBe(
		"hello",
	);
});

it("coalesces cleanup runs and releases its timer on dispose", async () => {
	const first = service.cleanup();
	expect(service.cleanup()).toBe(first);
	await first;
	vi.useFakeTimers();
	try {
		service.startCleanup();
		service.startCleanup();
		expect(vi.getTimerCount()).toBe(1);
		await service.dispose();
		expect(vi.getTimerCount()).toBe(0);
	} finally {
		vi.useRealTimers();
	}
});

it("retries singleton initialization after an asynchronous failure", async () => {
	const factory = vi
		.spyOn(UploadService, "create")
		.mockRejectedValueOnce(new Error("initialization failed"))
		.mockResolvedValueOnce(service);
	const req = new Request("http://localhost/uploads", { method: "OPTIONS" });
	await expect(handleTusRequest(req)).rejects.toThrow("initialization failed");
	expect((await handleTusRequest(req)).status).toBe(204);
	expect(factory).toHaveBeenCalledTimes(2);
});

it.each(["copy failure", "lost response"])(
	"recovers %s with the real tus client without creating or transmitting another upload",
	async (failure) => {
		const { defaultOptions } = await import("tus-js-client");
		const { UploadQueue } = await import("../components/upload/upload-queue");
		const data = new Map<string, string>();
		vi.stubGlobal("localStorage", {
			getItem: (key: string) => data.get(key),
			setItem: (key: string, value: string) => data.set(key, value),
		});
		vi.stubGlobal("location", { origin: "http://localhost" });
		vi.spyOn(defaultOptions.fileReader, "openFile").mockImplementation(
			async (file: File) => ({
				size: file.size,
				slice: async (start: number, end: number) => ({
					value: file.slice(start, end),
					done: end >= file.size,
				}),
				close() {},
			}),
		);
		const methods: string[] = [];
		let restarted = false;
		vi.spyOn(defaultOptions.httpStack, "createRequest").mockImplementation(
			(method, url) => {
				const headers = new Headers({ origin: "http://localhost" });
				const abort = new AbortController();
				return {
					getMethod: () => method,
					getURL: () => url,
					setHeader: (key, value) => headers.set(key, value),
					getHeader: (key) => headers.get(key) ?? undefined,
					setProgressHandler() {},
					getUnderlyingObject: () => null,
					abort: async () => {
						abort.abort();
					},
					send: async (body: BodyInit | null) => {
						methods.push(method);
						if (method === "HEAD" && !restarted) {
							await service.dispose();
							service = await createUploadService(config);
							restarted = true;
						}
						const response = await service.handle(
							new Request(new URL(url, "http://localhost"), {
								method,
								headers,
								body,
								signal: abort.signal,
								duplex: "half",
							} as RequestInit),
						);
						if (failure === "lost response" && method === "PATCH")
							throw new Error("connection lost after server completion");
						const text = await response.text();
						return {
							getStatus: () => response.status,
							getHeader: (key: string) =>
								response.headers.get(key) ?? undefined,
							getBody: () => text,
							getUnderlyingObject: () => response,
						};
					},
				};
			},
		);
		if (failure === "copy failure") {
			const error = Object.assign(new Error("disk full"), { code: "ENOSPC" });
			vi.mocked(copyFile)
				.mockRejectedValueOnce(error)
				.mockRejectedValueOnce(error);
		}
		const onComplete = vi.fn();
		const queue = new UploadQueue(onComplete);
		try {
			queue.add([new File(["hello"], "client.txt", { lastModified: 1 })], 100);
			await queue.start(queue.tasks[0].id, 100);
			await vi.waitFor(
				() =>
					expect(
						queue.tasks[0].status,
						JSON.stringify({
							methods,
							tasks: queue.tasks,
							reads: vi.mocked(defaultOptions.fileReader.openFile).mock.calls
								.length,
						}),
					).toBe("complete"),
				{
					timeout: 4000,
				},
			);
			expect(onComplete).toHaveBeenCalledTimes(1);
			expect(methods.filter((method) => method === "POST")).toHaveLength(1);
			expect(methods.filter((method) => method === "PATCH")).toHaveLength(1);
			expect(
				methods.filter((method) => method === "HEAD").length,
			).toBeGreaterThanOrEqual(1);
			expect(copyFile).toHaveBeenCalledTimes(
				failure === "copy failure" ? 3 : 1,
			);
			expect(
				await readFile(path.join(config!.datadir, "client.txt"), "utf8"),
			).toBe("hello");
			expect(await readdir(path.join(root, "tmp/tus"))).toEqual([]);
		} finally {
			queue.dispose();
			vi.unstubAllGlobals();
		}
	},
);

it.each(["same", "child", "parent"])(
	"rejects %s directory overlap before initializing tus",
	async (layout) => {
		const tempdir =
			layout === "same"
				? config!.datadir
				: layout === "child"
					? path.join(config!.datadir, "private")
					: root;
		await expect(createUploadService({ ...config!, tempdir })).rejects.toThrow(
			"Temporary directory must be separate",
		);
	},
);

it("keeps source, path, and method validation at the request boundary", async () => {
	expect((await request("POST", "/uploads", { origin: "" })).status).toBe(403);
	expect((await request("GET", "/uploads")).status).toBe(405);
	expect((await request("HEAD", "/uploads?extra=1")).status).toBe(404);
	const url = await create();
	expect((await request("POST", url)).status).toBe(405);
	service = await createUploadService({
		...config!,
		adminHost: "admin.example",
	});
	expect((await request("HEAD", url)).status).toBe(403);
	expect(
		(await request("HEAD", url, { origin: "https://admin.example" })).status,
	).toBe(200);
});

it.each([
	null,
	"invalid",
	{ success: false, filename: "包.txt", size: 5 },
	{ success: true, filename: "包.txt", size: -1 },
])("does not confirm completion from malformed receipt %j", async (receipt) => {
	const url = await create();
	await patch(url, 0, "hello");
	await writeFile(
		path.join(root, "tmp/tus-receipts", url.split("/").pop()!),
		JSON.stringify(receipt),
	);
	const response = await request("HEAD", url);
	expect(response.status).toBe(500);
	expect(response.headers.get("Upload-Offset")).toBeNull();
	expect(copyFile).toHaveBeenCalledTimes(1);
});

it.each([null, "failure", { status_code: 700, body: 123 }])(
	"maps unexpected thrown values %j to a valid error response",
	async (error) => {
		const url = await create();
		vi.mocked(copyFile).mockRejectedValueOnce(error);
		const response = await patch(url, 0, "hello");
		expect(response.status).toBe(500);
		expect(await response.text()).toContain("上传未完成");
	},
);

it("uses the same strict expiration boundary for completion and cleanup", async () => {
	const url = await create();
	const metadataPath = path.join(
		root,
		"tmp/tus",
		`${url.split("/").pop()!}.json`,
	);
	const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
	const created = Date.parse(metadata.creation_date);
	const now = vi
		.spyOn(Date, "now")
		.mockReturnValue(created + 7 * 24 * 60 * 60 * 1000);
	await service.cleanup();
	expect((await request("HEAD", url)).status).toBe(200);
	now.mockReturnValue(created + 7 * 24 * 60 * 60 * 1000 + 1);
	expect((await request("HEAD", url)).status).toBe(410);
	await service.cleanup();
	expect((await request("HEAD", url)).status).toBe(404);
});
