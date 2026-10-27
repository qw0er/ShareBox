import { afterEach, expect, it, vi } from "vitest";
import {
	isTextFile,
	MAX_COPY_TEXT_BYTES,
	readTextFile,
	TextFileTooLarge,
} from "../components/files/copy-text";

afterEach(() => vi.unstubAllGlobals());

it("recognizes common text extensions case-insensitively", () => {
	expect(isTextFile("notes.TXT")).toBe(true);
	expect(isTextFile("config.yaml")).toBe(true);
	expect(isTextFile("image.png")).toBe(false);
});

it("reads UTF-8 content through the authenticated download URL", async () => {
	const fetcher = vi.fn(async () => new Response("hello 世界"));
	vi.stubGlobal("fetch", fetcher);
	expect(await readTextFile("folder/a & b.txt")).toBe("hello 世界");
	expect(fetcher).toHaveBeenCalledWith("/download?path=folder%2Fa+%26+b.txt", {
		redirect: "error",
	});
});

it("rejects files above the limit even without an accurate content length", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response(new Uint8Array(MAX_COPY_TEXT_BYTES + 1))),
	);
	await expect(readTextFile("large.txt")).rejects.toBeInstanceOf(
		TextFileTooLarge,
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async () =>
				new Response("small", {
					headers: { "Content-Length": String(MAX_COPY_TEXT_BYTES + 1) },
				}),
		),
	);
	await expect(readTextFile("changed.txt")).rejects.toBeInstanceOf(
		TextFileTooLarge,
	);
});

it("rejects failed downloads and invalid UTF-8", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response("denied", { status: 401 })),
	);
	await expect(readTextFile("private.txt")).rejects.toThrow();
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response(new Uint8Array([0xff]))),
	);
	await expect(readTextFile("invalid.txt")).rejects.toThrow();
});
