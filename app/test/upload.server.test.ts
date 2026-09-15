import { createWriteStream } from "node:fs";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
} from "node:fs/promises";
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
	return { ...module, copyFile: vi.fn(module.copyFile) };
});
process.env.DATA_DIR = process.cwd();
process.env.LOGGER_LEVEL = "silent";
const { CONFIG } = await import("../server/config.server");
const { handleFileAction } = await import("../server/file-actions.server");
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
async function request(names = ["file.txt"]) {
	const form = new FormData();
	form.set("intent", "upload");
	for (const name of names) form.append("file", new File(["hello"], name));
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
it("cleans temporary files when publication fails", async () => {
	vi.mocked(copyFile).mockRejectedValueOnce(
		Object.assign(new Error("disk full"), { code: "ENOSPC" }),
	);
	expect(await handleFileAction(await request())).toHaveProperty("error");
	await noResidue();
});
it("keeps the file private until the complete request arrives and cleans up on abort", async () => {
	const encoded = await request(["first.txt", "second.txt"]);
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
		expect(await readdir(CONFIG.tempdir)).toHaveLength(2),
	);
	expect(await readdir(CONFIG.datadir)).toEqual([]);
	abort.abort();
	expect(await pending).toHaveProperty("error");
	await noResidue();
});

it("retains the temporary source until a delayed copy completes", async () => {
	const original =
		await vi.importActual<typeof import("node:fs/promises")>(
			"node:fs/promises",
		);
	vi.mocked(copyFile).mockImplementationOnce(
		async (source, destination, mode) => {
			await new Promise((resolve) => setTimeout(resolve, 30));
			expect(await readFile(source, "utf8")).toBe("hello");
			await original.copyFile(source, destination, mode);
		},
	);
	expect(await handleFileAction(await request())).toEqual({ success: true });
	expect(await readFile(path.join(CONFIG.datadir, "file.txt"), "utf8")).toBe(
		"hello",
	);
	expect(await readdir(CONFIG.tempdir)).toEqual([]);
});

it("continues a batch after a copy failure and cleans all temporary files", async () => {
	vi.mocked(copyFile).mockRejectedValueOnce(
		Object.assign(new Error("disk full"), { code: "ENOSPC" }),
	);
	const result = await handleFileAction(
		await request(["failed.txt", "good.txt"]),
	);
	expect(result.results?.map((entry) => !!entry.error)).toEqual([true, false]);
	expect(await readdir(CONFIG.datadir)).toEqual(["good.txt"]);
	expect(await readFile(path.join(CONFIG.datadir, "good.txt"), "utf8")).toBe(
		"hello",
	);
	expect(await readdir(CONFIG.tempdir)).toEqual([]);
});
