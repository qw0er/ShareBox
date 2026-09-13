import { createWriteStream } from "node:fs";
import { link, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("node:fs", async (original) => {
	const module = await original<typeof import("node:fs")>();
	return { ...module, createWriteStream: vi.fn(module.createWriteStream) };
});
vi.mock("node:fs/promises", async (original) => {
	const module = await original<typeof import("node:fs/promises")>();
	return { ...module, link: vi.fn(module.link) };
});
process.env.DATA_DIR = process.cwd();
process.env.LOGGER_LEVEL = "silent";
const { CONFIG } = await import("./config.server");
const { handleFileAction } = await import("./file-actions.server");
let root: string;
beforeEach(async () => {
	root = await mkdtemp(path.join(os.tmpdir(), "sharebox-upload-faults-"));
	CONFIG.datadir = path.join(root, "public");
	CONFIG.tempdir = path.join(root, "tmp");
	CONFIG.maxUploadBytes = 1024;
	CONFIG.adminHost = "";
	await mkdir(CONFIG.datadir);
});
afterEach(async () => {
	vi.clearAllMocks();
	await rm(root, { recursive: true, force: true });
});
async function request() {
	const form = new FormData();
	form.set("intent", "upload");
	form.set("file", new File(["hello"], "file.txt"));
	const encoded = new Request("http://localhost/", {
		method: "POST",
		headers: { origin: "http://localhost" },
		body: form,
	});
	return new Request(encoded.url, {
		method: "POST",
		headers: encoded.headers,
		body: await encoded.arrayBuffer(),
	});
}
async function noResidue() {
	expect(await readdir(CONFIG.datadir)).toEqual([]);
	expect(await readdir(CONFIG.tempdir)).toEqual([]);
}
it("cleans temporary files when disk writes fail", async () => {
	vi.mocked(createWriteStream).mockImplementationOnce(
		() =>
			new Writable({
				write(_chunk, _encoding, callback) {
					callback(Object.assign(new Error("disk full"), { code: "ENOSPC" }));
				},
			}) as ReturnType<typeof createWriteStream>,
	);
	expect(await handleFileAction(await request())).toHaveProperty("error");
	await noResidue();
});
it("cleans temporary files on publication failure without a non-atomic fallback", async () => {
	vi.mocked(link).mockRejectedValueOnce(
		Object.assign(new Error("cross-device link"), { code: "EXDEV" }),
	);
	expect(await handleFileAction(await request())).toHaveProperty("error");
	await noResidue();
});
it("keeps the file private until the complete request arrives and cleans up on abort", async () => {
	const encoded = await request();
	const bytes = new Uint8Array(await encoded.arrayBuffer());
	const abort = new AbortController();
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(bytes.slice(0, -15));
		},
	});
	const pending = handleFileAction(
		new Request(encoded.url, {
			method: "POST",
			headers: encoded.headers,
			body,
			signal: abort.signal,
			duplex: "half",
		} as RequestInit),
	);
	await vi.waitFor(async () =>
		expect(await readdir(CONFIG.tempdir)).toHaveLength(1),
	);
	expect(await readdir(CONFIG.datadir)).toEqual([]);
	abort.abort();
	expect(await pending).toHaveProperty("error");
	await noResidue();
});
