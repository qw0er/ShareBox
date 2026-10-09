import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/logger.server", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
	downloadPublicFile,
	readPublicDirectory,
} from "../server/public-files.server";
import { publicPageUrl } from "../utils/public-links";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(path.join(os.tmpdir(), "sharebox-public-"));
	await mkdir(path.join(root, "资料"));
	await writeFile(path.join(root, "资料", "中文 #?%.txt"), "0123456789");
	await writeFile(path.join(root, "empty.txt"), "");
});
afterEach(() => rm(root, { recursive: true, force: true }));
function request(
	file = "资料/中文 #?%.txt",
	headers: HeadersInit = {},
	method = "GET",
) {
	return new Request(
		`http://localhost/public/download?${new URLSearchParams({ path: file })}`,
		{ headers, method },
	);
}

describe("public directory", () => {
	it("lists direct children with metadata and safe links, directories first", async () => {
		await symlink(path.join(root, "资料"), path.join(root, "link"));
		const result = await readPublicDirectory(root, "");
		expect(result.entries.map((e) => e.name)).toEqual(["资料", "empty.txt"]);
		expect(result.entries[0].downloadUrl).toBeNull();
		const nested = await readPublicDirectory(root, "资料");
		expect(nested.entries[0]).toMatchObject({
			type: "file",
			size: 10,
			path: "资料/中文 #?%.txt",
			modifiedAt: expect.stringMatching(/^\d{4}-/),
		});
		expect(
			new URL(
				nested.entries[0].downloadUrl ?? "",
				"http://localhost",
			).searchParams.get("path"),
		).toBe("资料/中文 #?%.txt");
		expect(
			new URL(publicPageUrl("资料/#?%"), "http://localhost").searchParams.get(
				"path",
			),
		).toBe("资料/#?%");
	});
	it("handles empty, missing and file directories", async () => {
		await mkdir(path.join(root, "empty"));
		expect((await readPublicDirectory(root, "empty")).entries).toEqual([]);
		await expect(readPublicDirectory(root, "missing")).rejects.toMatchObject({
			status: 404,
		});
		await expect(readPublicDirectory(root, "empty.txt")).rejects.toMatchObject({
			status: 404,
		});
	});
	it.each([
		"../private",
		"/tmp",
		"C:/private",
		"资料/../empty.txt",
		"资料//nested",
		"资料\\nested",
		"bad\0name",
	])("rejects invalid paths: %s", async (value) => {
		await expect(readPublicDirectory(root, value)).rejects.toMatchObject({
			status: 400,
		});
		await expect(
			downloadPublicFile(root, request(value)),
		).rejects.toMatchObject({ status: 400 });
	});
	it("rejects symlink files and parent directories", async () => {
		await symlink(path.join(root, "资料"), path.join(root, "alias"));
		await symlink(path.join(root, "empty.txt"), path.join(root, "link.txt"));
		await expect(readPublicDirectory(root, "alias")).rejects.toMatchObject({
			status: 404,
		});
		for (const file of ["link.txt", "alias/中文 #?%.txt"]) {
			await expect(
				downloadPublicFile(root, request(file)),
			).rejects.toMatchObject({ status: 404 });
		}
	});
});

describe("public download", () => {
	it("streams exact bytes and provides an attachment with the original UTF-8 name", async () => {
		const response = await downloadPublicFile(root, request());
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Length")).toBe("10");
		expect(response.headers.get("Content-Disposition")).toContain(
			`filename*=UTF-8''${encodeURIComponent("中文 #?%.txt")}`,
		);
		expect(response.headers.get("Accept-Ranges")).toBe("bytes");
		expect(await response.text()).toBe("0123456789");
	});
	it.each([
		["bytes=2-5", "2345", "bytes 2-5/10"],
		["bytes=7-", "789", "bytes 7-9/10"],
		["bytes=-3", "789", "bytes 7-9/10"],
		["bytes=8-100", "89", "bytes 8-9/10"],
	])("supports %s", async (range, body, contentRange) => {
		const response = await downloadPublicFile(
			root,
			request(undefined, { Range: range }),
		);
		expect(response.status).toBe(206);
		expect(response.headers.get("Content-Range")).toBe(contentRange);
		expect(await response.text()).toBe(body);
	});
	it.each(["bytes=10-", "bytes=8-2", "bytes=-0"])(
		"returns 416 for %s",
		async (range) => {
			await expect(
				downloadPublicFile(root, request(undefined, { Range: range })),
			).rejects.toMatchObject({ status: 416 });
		},
	);
	it("supports HEAD and zero-byte files", async () => {
		const head = await downloadPublicFile(root, request(undefined, {}, "HEAD"));
		expect(head.headers.get("Content-Length")).toBe("10");
		expect(await head.text()).toBe("");
		const empty = await downloadPublicFile(root, request("empty.txt"));
		expect(empty.headers.get("Content-Length")).toBe("0");
		expect(await empty.text()).toBe("");
	});
	it("ignores stale If-Range and multiple ranges", async () => {
		const cases: HeadersInit[] = [
			{ Range: "bytes=1-2", "If-Range": "Wed, 01 Jan 2020 00:00:00 GMT" },
			{ Range: "bytes=0-1,4-5" },
		];
		for (const headers of cases) {
			const response = await downloadPublicFile(
				root,
				request(undefined, headers),
			);
			expect(response.status).toBe(200);
			expect(await response.text()).toBe("0123456789");
		}
	});
	it("rejects directories, missing files and empty paths", async () => {
		await expect(
			downloadPublicFile(root, request("资料")),
		).rejects.toMatchObject({ status: 404 });
		await expect(
			downloadPublicFile(root, request("missing")),
		).rejects.toMatchObject({ status: 404 });
		await expect(downloadPublicFile(root, request(""))).rejects.toMatchObject({
			status: 400,
		});
	});
});
