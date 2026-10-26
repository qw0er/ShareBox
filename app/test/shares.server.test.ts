import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openDatabase, type StateDatabase } from "../server/db/client.server";
import { deliverFile } from "../server/files/delivery.server";
import { handleShareAction } from "../server/shares/actions.server";
import { downloadShare, publishFile } from "../server/shares/service.server";
import {
	createShareStore,
	type ShareStore,
} from "../server/shares/store.server";

let root: string;
let files: string;
let database: StateDatabase;
let store: ShareStore;
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "sharebox-shares-"));
	const state = path.join(root, "state");
	files = path.join(state, "files");
	await fs.mkdir(files, { recursive: true });
	await fs.writeFile(path.join(files, "test.txt"), "0123456789");
	database = openDatabase(path.join(state, "state.db"));
	store = createShareStore(database);
});
afterEach(async () => {
	vi.restoreAllMocks();
	if (database.sqlite.open) database.sqlite.close();
	await fs.rm(root, { recursive: true, force: true });
});
function request(id: string, method = "GET", headers: HeadersInit = {}) {
	return new Request(`http://localhost/s/${id}`, { method, headers });
}
async function download(id: string, method = "GET", headers: HeadersInit = {}) {
	return downloadShare(store, files, id, request(id, method, headers));
}
it("publishes root files idempotently and persists links across a restart", async () => {
	const id = await publishFile(store, files, "test.txt");
	expect(id).toMatch(/^[a-f0-9]{32}$/);
	expect(await publishFile(store, files, "test.txt")).toBe(id);
	const saved = store.find(id);
	const stats = await fs.lstat(path.join(files, "test.txt"), { bigint: true });
	expect(saved).toMatchObject({
		targetDev: stats.dev.toString(),
		targetIno: stats.ino.toString(),
	});
	database.sqlite.close();
	database = openDatabase(path.join(root, "state/state.db"));
	store = createShareStore(database);
	const response = await download(id);
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("0123456789");
	expect(response.headers.get("Content-Disposition")).toContain("attachment;");
	expect(response.headers.get("Cache-Control")).toBe("no-store");
	expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
});
it("supports HEAD, bounded/open/suffix Range, and 416", async () => {
	const id = await publishFile(store, files, "test.txt");
	const head = await download(id, "HEAD");
	expect(head.status).toBe(200);
	expect(head.headers.get("Content-Length")).toBe("10");
	expect(await head.text()).toBe("");
	for (const [range, expected] of [
		["bytes=2-5", "2345"],
		["bytes=7-", "789"],
		["bytes=-2", "89"],
	]) {
		const response = await download(id, "GET", { Range: range || "" });
		expect(response.status).toBe(206);
		expect(await response.text()).toBe(expected);
	}
	const invalid = await download(id, "GET", { Range: "bytes=100-" });
	expect(invalid.status).toBe(416);
	expect(invalid.headers.get("Content-Range")).toBe("bytes */10");
	expect(invalid.headers.get("Cache-Control")).toBe("no-store");
	expect(invalid.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
});
it("immediately revokes links and returns the same 404 for malformed and unknown ids", async () => {
	const id = await publishFile(store, files, "test.txt");
	store.revoke(id);
	store.revoke(id);
	for (const value of [id, "f".repeat(32), "../test.txt", "invalid"]) {
		const response = await download(value);
		expect(response.status).toBe(404);
		expect(await response.text()).toBe("文件不存在");
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	}
});
it("invalidates replaced or missing targets; republishing replaces the stale record", async () => {
	const id = await publishFile(store, files, "test.txt");
	await fs.rename(
		path.join(files, "test.txt"),
		path.join(files, "original.txt"),
	);
	expect((await download(id)).status).toBe(404);
	await fs.writeFile(path.join(files, "test.txt"), "replacement");
	expect((await download(id)).status).toBe(404);
	const next = await publishFile(store, files, "test.txt");
	expect(next).not.toBe(id);
	expect(store.find(id)).toBeUndefined();
	expect(await (await download(next)).text()).toBe("replacement");
});
it("serves in-place edits and zero byte files", async () => {
	const id = await publishFile(store, files, "test.txt");
	await fs.writeFile(path.join(files, "test.txt"), "updated");
	expect(await (await download(id)).text()).toBe("updated");
	await fs.writeFile(path.join(files, "test.txt"), "");
	const empty = await download(id);
	expect(empty.status).toBe(200);
	expect(empty.headers.get("Content-Length")).toBe("0");
	expect(await empty.text()).toBe("");
});
it("rejects directories, symlinks and unsafe paths, including symbolic parents", async () => {
	await fs.mkdir(path.join(files, "dir"));
	await fs.symlink(path.join(files, "test.txt"), path.join(files, "link"));
	await fs.symlink(files, path.join(files, "parent"));
	for (const target of [
		"dir",
		"link",
		"parent/test.txt",
		"../secret",
		"/etc/passwd",
		"missing",
		"",
	]) {
		await expect(publishFile(store, files, target)).rejects.toMatchObject({
			status: 400,
		});
	}
	const id = await publishFile(store, files, "test.txt");
	await fs.rename(
		path.join(files, "test.txt"),
		path.join(files, "original.txt"),
	);
	await fs.symlink(
		path.join(files, "original.txt"),
		path.join(files, "test.txt"),
	);
	expect((await download(id)).status).toBe(404);
});
it("checks the identity on the descriptor even when replacement happens during open", async () => {
	const id = await publishFile(store, files, "test.txt");
	const originalOpen = fs.open.bind(fs);
	vi.spyOn(fs, "open").mockImplementationOnce(async (...args) => {
		await fs.rename(
			path.join(files, "test.txt"),
			path.join(files, "original.txt"),
		);
		await fs.writeFile(path.join(files, "test.txt"), "secret replacement");
		return originalOpen(...args);
	});
	expect((await download(id)).status).toBe(404);
});
it("rejects an incorrect identity through the shared file delivery boundary", async () => {
	await expect(
		deliverFile(files, "test.txt", request("unused"), "shares", {
			targetDev: "0",
			targetIno: "0",
		}),
	).rejects.toMatchObject({ status: 404 });
});
it("creates/revokes using bounded POST forms and rejects foreign/missing origins and unsupported methods", async () => {
	function action(
		operation: "create" | "revoke",
		body: URLSearchParams,
		origin: string | null = "http://localhost",
		method = "POST",
	) {
		return handleShareAction(
			new Request(`http://localhost/shares/${operation}`, {
				method,
				headers: origin ? { Origin: origin } : {},
				...(method === "POST" ? { body } : {}),
			}),
			operation,
			store,
			files,
			"",
		);
	}
	for (const origin of [null, "https://evil.example"])
		expect(
			(
				await action(
					"create",
					new URLSearchParams({ path: "test.txt" }),
					origin,
				)
			).status,
		).toBe(403);
	expect(
		(await action("create", new URLSearchParams(), "http://localhost", "GET"))
			.status,
	).toBe(405);
	const created = await action(
		"create",
		new URLSearchParams({ path: "test.txt" }),
	);
	expect(created.status).toBe(200);
	const { shareId } = await created.json();
	expect(await (await download(shareId)).text()).toBe("0123456789");
	expect(
		(await action("revoke", new URLSearchParams({ shareId }))).status,
	).toBe(200);
	expect((await download(shareId)).status).toBe(404);
	expect(
		(await action("revoke", new URLSearchParams({ shareId: "bad" }))).status,
	).toBe(400);
	expect(
		(await action("create", new URLSearchParams({ path: "x".repeat(17000) })))
			.status,
	).toBe(400);
});

it("rolls back a stale share replacement when inserting the new record fails", async () => {
	const original = await publishFile(store, files, "test.txt");
	await fs.rename(
		path.join(files, "test.txt"),
		path.join(files, "original.txt"),
	);
	await fs.writeFile(path.join(files, "test.txt"), "replacement");
	database.sqlite.exec(
		"CREATE TRIGGER reject_share BEFORE INSERT ON shares BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
	);
	await expect(publishFile(store, files, "test.txt")).rejects.toThrow();
	expect(store.find(original)).toBeDefined();
	expect((await download(original)).status).toBe(404);
});

it("honors the configured production origin and rejects malformed or ambiguous forms", async () => {
	const create = (body: BodyInit, headers: HeadersInit) =>
		handleShareAction(
			new Request("http://internal/shares/create", {
				method: "POST",
				headers,
				body,
			}),
			"create",
			store,
			files,
			"sharebox.example",
		);
	expect(
		(
			await create(new URLSearchParams({ path: "test.txt" }), {
				Origin: "http://internal",
			})
		).status,
	).toBe(403);
	expect(
		(
			await create(new URLSearchParams({ path: "test.txt" }), {
				Origin: "https://sharebox.example",
			})
		).status,
	).toBe(200);
	expect(
		(
			await create('{"path":"test.txt"}', {
				Origin: "https://sharebox.example",
				"Content-Type": "application/json",
			})
		).status,
	).toBe(400);
	expect(
		(
			await create(
				new URLSearchParams([
					["path", "test.txt"],
					["path", "other"],
				]),
				{ Origin: "https://sharebox.example" },
			)
		).status,
	).toBe(400);
});

it("lists valid, missing and replaced shares without exposing filesystem identities", async () => {
	const { listShares } = await import("../server/shares/service.server");
	const id = await publishFile(store, files, "test.txt");
	expect(await listShares(store, files)).toEqual([
		{ id, targetPath: "test.txt", status: "valid" },
	]);
	await fs.rename(
		path.join(files, "test.txt"),
		path.join(files, "original.txt"),
	);
	expect(await listShares(store, files)).toEqual([
		{ id, targetPath: "test.txt", status: "invalid" },
	]);
	await fs.writeFile(path.join(files, "test.txt"), "replacement");
	expect((await listShares(store, files))[0].status).toBe("invalid");
});

it("renames scopes literally, clears stale destinations and leaves sibling prefixes untouched", async () => {
	const identity = { targetDev: "1", targetIno: "2" };
	const moved = store.publish("dir_%/a/file", identity);
	const sibling = store.publish("dir_%-other/file", identity);
	const stale = store.publish("new/a/file", identity);
	store.renamePaths("dir_%", "new");
	expect(store.find(moved)?.targetPath).toBe("new/a/file");
	expect(store.find(sibling)?.targetPath).toBe("dir_%-other/file");
	expect(store.find(stale)).toBeUndefined();
	store.removePaths("new");
	expect(store.find(moved)).toBeUndefined();
	expect(store.find(sibling)).toBeDefined();
});

it("rolls back all share path changes when updating a directory fails", () => {
	const identity = { targetDev: "1", targetIno: "2" };
	const a = store.publish("old/a", identity);
	const b = store.publish("old/b", identity);
	const stale = store.publish("new/a", identity);
	database.sqlite.exec(
		"CREATE TRIGGER reject_move BEFORE UPDATE ON shares WHEN NEW.target_path = 'new/b' BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
	);
	expect(() => store.renamePaths("old", "new")).toThrow();
	expect(store.find(a)?.targetPath).toBe("old/a");
	expect(store.find(b)?.targetPath).toBe("old/b");
	expect(store.find(stale)?.targetPath).toBe("new/a");
});
