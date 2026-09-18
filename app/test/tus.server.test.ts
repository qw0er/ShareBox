import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

process.env.DATA_DIR = process.cwd();
process.env.LOGGER_LEVEL = "silent";
const { createUploadService } = await import("../server/tus.server");
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
	expect((await request("POST", `${url}/complete`)).status).toBe(409);
	service = await createUploadService(config);
	expect((await request("HEAD", url)).headers.get("Upload-Offset")).toBe("2");
	expect((await patch(url, 0, "oops")).status).toBe(409);
	expect((await patch(url, 2, "llo")).status).toBe(204);
	expect((await request("POST", `${url}/complete`)).status).toBe(200);
	expect(await readFile(path.join(config!.datadir, "包.txt"), "utf8")).toBe(
		"hello",
	);
	expect(await readdir(path.join(root, "tmp/tus"))).toEqual([]);
	service = await createUploadService(config);
	expect(await (await request("POST", `${url}/complete`)).json()).toEqual({
		success: true,
		filename: "包.txt",
	});
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
	await patch(first, 0, "first");
	await patch(second, 0, "other");
	expect((await request("POST", `${first}/complete`)).status).toBe(200);
	expect((await request("POST", `${second}/complete`)).status).toBe(409);
	expect(await readFile(path.join(config!.datadir, "same.txt"), "utf8")).toBe(
		"first",
	);
	expect((await request("HEAD", second)).headers.get("Upload-Offset")).toBe(
		"5",
	);
	expect((await request("DELETE", second)).status).toBe(204);
});
it("publishes zero-byte files and cleans expired unfinished tasks", async () => {
	const empty = await create("empty", 0);
	expect((await request("POST", `${empty}/complete`)).status).toBe(200);
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
