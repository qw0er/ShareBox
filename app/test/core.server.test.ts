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

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getFileTree, removeFileEntry } from "../server/core.server";

describe("file system core", () => {
	let rootDir: string;

	beforeEach(async () => {
		rootDir = await mkdtemp(path.join(os.tmpdir(), "sharebox-core-"));
	});

	afterEach(async () => {
		await rm(rootDir, { recursive: true, force: true });
	});

	it("builds a sorted file tree and ignores symbolic links", async () => {
		await mkdir(path.join(rootDir, "z-directory"));
		await mkdir(path.join(rootDir, "a-directory"));
		await writeFile(path.join(rootDir, "z.txt"), "z");
		await writeFile(path.join(rootDir, "a.txt"), "abc");
		await writeFile(path.join(rootDir, "a-directory", "nested.txt"), "nested");
		await symlink(
			path.join(rootDir, "a.txt"),
			path.join(rootDir, "ignored-link"),
		);

		await expect(getFileTree(rootDir)).resolves.toEqual([
			{
				name: "a-directory",
				path: "a-directory",
				type: "directory",
				children: [
					{
						name: "nested.txt",
						path: "a-directory/nested.txt",
						type: "file",
						size: 6,
					},
				],
			},
			{
				name: "z-directory",
				path: "z-directory",
				type: "directory",
				children: [],
			},
			{ name: "a.txt", path: "a.txt", type: "file", size: 3 },
			{ name: "z.txt", path: "z.txt", type: "file", size: 1 },
		]);
	});

	it("removes a file inside the data directory", async () => {
		const filePath = path.join(rootDir, "remove-me.txt");
		await writeFile(filePath, "content");

		await removeFileEntry(rootDir, "remove-me.txt");

		await expect(stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("removes an empty directory", async () => {
		const directoryPath = path.join(rootDir, "empty");
		await mkdir(directoryPath);

		await removeFileEntry(rootDir, "empty");

		await expect(stat(directoryPath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("does not remove a non-empty directory", async () => {
		await mkdir(path.join(rootDir, "not-empty"));
		await writeFile(path.join(rootDir, "not-empty", "file.txt"), "content");

		await expect(removeFileEntry(rootDir, "not-empty")).rejects.toMatchObject({
			code: expect.stringMatching(/^(ENOTEMPTY|EEXIST)$/),
		});
		await expect(
			readFile(path.join(rootDir, "not-empty", "file.txt"), "utf8"),
		).resolves.toBe("content");
	});

	it.each(["", "../outside.txt", "/tmp/outside.txt", "folder/../file.txt"])(
		"rejects invalid path %j",
		async (relativePath) => {
			await expect(removeFileEntry(rootDir, relativePath)).rejects.toThrow(
				"Invalid file path",
			);
		},
	);

	it("does not follow a symbolic link while removing", async () => {
		const targetPath = path.join(rootDir, "target.txt");
		await writeFile(targetPath, "keep");
		await symlink(targetPath, path.join(rootDir, "target-link"));

		await expect(removeFileEntry(rootDir, "target-link")).rejects.toThrow(
			"Symbolic links are not supported",
		);
		await expect(readFile(targetPath, "utf8")).resolves.toBe("keep");
	});
	it("rejects symbolic roots for listing and deletion", async () => {
		await mkdir(path.join(rootDir, "real"));
		await writeFile(path.join(rootDir, "real", "keep"), "original");
		await symlink(path.join(rootDir, "real"), path.join(rootDir, "alias"));
		await expect(getFileTree(path.join(rootDir, "alias"))).rejects.toThrow(
			"Invalid data directory",
		);
		await expect(
			removeFileEntry(path.join(rootDir, "alias"), "keep"),
		).rejects.toThrow("Invalid data directory");
		expect(await readFile(path.join(rootDir, "real", "keep"), "utf8")).toBe(
			"original",
		);
	});
	it("rejects deletion through a symbolic parent directory", async () => {
		await mkdir(path.join(rootDir, "real"));
		await writeFile(path.join(rootDir, "real", "keep"), "original");
		await symlink(path.join(rootDir, "real"), path.join(rootDir, "alias"));
		await expect(removeFileEntry(rootDir, "alias/keep")).rejects.toThrow(
			"Symbolic links",
		);
		expect(await readFile(path.join(rootDir, "real", "keep"), "utf8")).toBe(
			"original",
		);
	});
});
