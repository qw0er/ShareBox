import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { hashPassword } from "../server/password.server";

let root: string;
let cookie: string;
let createRoute: typeof import("../routes/shares-create");
let revokeRoute: typeof import("../routes/shares-revoke");
let shareRoute: typeof import("../routes/share");
let config: typeof import("../server/config.server");
beforeAll(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "sharebox-share-routes-"));
	vi.stubEnv("STATE_DIR", path.join(root, "state"));
	vi.stubEnv("PROD", false);
	vi.stubEnv("LOGGER_LEVEL", "silent");
	config = await import("../server/config.server");
	const { adminCredentials } = await import("../server/db/schema");
	config.DATABASE.db
		.insert(adminCredentials)
		.values({
			id: 1,
			username: "admin",
			passwordHash: await hashPassword("route-password"),
			sessionSecret: "route-test-secret-at-least-32-bytes",
		})
		.run();
	createRoute = await import("../routes/shares-create");
	revokeRoute = await import("../routes/shares-revoke");
	shareRoute = await import("../routes/share");
	await fs.writeFile(
		path.join(config.CONFIG.filesDir, "file.txt"),
		"shared contents",
	);
	const auth = (await import("../server/auth.server")).getAuth();
	const response = await auth.login(
		new Request("http://localhost/login", {
			method: "POST",
			headers: { Origin: "http://localhost" },
			body: new URLSearchParams({
				username: "admin",
				password: "route-password",
			}),
		}),
	);
	if (!(response instanceof Response))
		throw new Error("Missing login response");
	cookie = response.headers.get("Set-Cookie")?.split(";")[0] || "";
	expect(cookie).toBeTruthy();
});
afterAll(async () => {
	config?.DATABASE.sqlite.close();
	vi.unstubAllEnvs();
	await fs.rm(root, { recursive: true, force: true });
});
function createArgs(request: Request) {
	return { request } as Parameters<typeof createRoute.action>[0];
}
function revokeArgs(request: Request) {
	return { request } as Parameters<typeof revokeRoute.action>[0];
}
function shareArgs(request: Request, shareId: string) {
	return { request, params: { shareId } } as Parameters<
		typeof shareRoute.loader
	>[0];
}
function formRequest(
	operation: string,
	body: URLSearchParams,
	headers = { Cookie: cookie, Origin: "http://localhost" },
) {
	return new Request(`http://localhost/shares/${operation}`, {
		method: "POST",
		headers,
		body,
	});
}
it("requires authentication before accepting share actions or exposing form errors", async () => {
	await expect(
		createRoute.action(
			createArgs(
				new Request("http://localhost/shares/create", { method: "POST" }),
			),
		),
	).rejects.toMatchObject({ status: 401 });
	await expect(
		revokeRoute.action(
			revokeArgs(
				new Request("http://localhost/shares/revoke", { method: "POST" }),
			),
		),
	).rejects.toMatchObject({ status: 401 });
});
it("rejects cross-origin actions and authenticated GETs", async () => {
	const response = await createRoute.action(
		createArgs(
			formRequest("create", new URLSearchParams({ path: "file.txt" }), {
				Cookie: cookie,
				Origin: "https://evil.example",
			}),
		),
	);
	expect(response.status).toBe(403);
	expect(
		(
			await createRoute.loader(
				createArgs(
					new Request("http://localhost/shares/create", {
						headers: { Cookie: cookie },
					}),
				),
			)
		).status,
	).toBe(405);
});
it("allows an administrator to create, anonymously download, and revoke a share", async () => {
	const created = await createRoute.action(
		createArgs(
			formRequest("create", new URLSearchParams({ path: "file.txt" })),
		),
	);
	expect(created.status).toBe(200);
	const { shareId } = await created.json();
	const url = `http://localhost/s/${shareId}`;
	const downloaded = await shareRoute.loader(
		shareArgs(new Request(url), shareId),
	);
	expect(downloaded.status).toBe(200);
	expect(await downloaded.text()).toBe("shared contents");
	const head = await shareRoute.loader(
		shareArgs(new Request(url, { method: "HEAD" }), shareId),
	);
	expect(head.status).toBe(200);
	expect(await head.text()).toBe("");
	const revoked = await revokeRoute.action(
		revokeArgs(formRequest("revoke", new URLSearchParams({ shareId }))),
	);
	expect(revoked.status).toBe(200);
	expect(
		(await shareRoute.loader(shareArgs(new Request(url), shareId))).status,
	).toBe(404);
});
it("returns anonymous 404 for unknown shares and 405 for writes to download URLs", async () => {
	const id = "f".repeat(32);
	const url = `http://localhost/s/${id}`;
	expect(
		(await shareRoute.loader(shareArgs(new Request(url), id))).status,
	).toBe(404);
	const response = await shareRoute.action(
		shareArgs(new Request(url, { method: "POST" }), id),
	);
	expect(response.status).toBe(405);
	expect(response.headers.get("Allow")).toBe("GET, HEAD");
});

it("keeps file and parent-directory renames downloadable and cleans deletion scopes", async () => {
	const rename = await import("../routes/files-rename");
	const remove = await import("../routes/files-remove");
	const { shareStore } = await import("../server/shares/runtime.server");
	const { publishFile, listShares } = await import(
		"../server/shares/service.server"
	);
	const files = config.CONFIG.filesDir;
	await fs.mkdir(path.join(files, "folder_%"));
	await fs.writeFile(path.join(files, "folder_%/a.txt"), "nested file");
	const id = await publishFile(shareStore, files, "folder_%/a.txt");
	const renameEntry = (relativePath: string, newName: string) =>
		rename.action({
			request: new Request("http://localhost/files/rename", {
				method: "POST",
				headers: { Cookie: cookie, Origin: "http://localhost" },
				body: new URLSearchParams({ path: relativePath, newName }),
			}),
		} as Parameters<typeof rename.action>[0]);
	const removeEntry = (relativePath: string) =>
		remove.action({
			request: new Request("http://localhost/files/remove", {
				method: "POST",
				headers: { Cookie: cookie, Origin: "http://localhost" },
				body: new URLSearchParams({ path: relativePath }),
			}),
		} as Parameters<typeof remove.action>[0]);
	expect(await renameEntry("folder_%/a.txt", "b.txt")).toEqual({
		success: true,
	});
	expect(shareStore.find(id)?.targetPath).toBe("folder_%/b.txt");
	expect(await renameEntry("folder_%", "renamed")).toEqual({ success: true });
	expect(shareStore.find(id)?.targetPath).toBe("renamed/b.txt");
	const response = await shareRoute.loader(
		shareArgs(new Request(`http://localhost/s/${id}`), id),
	);
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("nested file");
	expect(
		(await listShares(shareStore, files)).find((share) => share.id === id)
			?.status,
	).toBe("valid");
	expect(await removeEntry("renamed/b.txt")).toEqual({ success: true });
	expect(shareStore.find(id)).toBeUndefined();
	expect(
		(
			await shareRoute.loader(
				shareArgs(new Request(`http://localhost/s/${id}`), id),
			)
		).status,
	).toBe(404);
	const stale = shareStore.publish("renamed/deleted.txt", {
		targetDev: "1",
		targetIno: "2",
	});
	expect(await removeEntry("renamed")).toEqual({ success: true });
	expect(shareStore.find(stale)).toBeUndefined();
});

it("reports share sync failure without misreporting a completed filesystem operation", async () => {
	const rename = await import("../routes/files-rename");
	const { shareStore } = await import("../server/shares/runtime.server");
	const { publishFile } = await import("../server/shares/service.server");
	const files = config.CONFIG.filesDir;
	await fs.writeFile(path.join(files, "sync-source.txt"), "contents");
	const id = await publishFile(shareStore, files, "sync-source.txt");
	const sync = vi
		.spyOn(shareStore, "renamePaths")
		.mockImplementationOnce(() => {
			throw new Error("database unavailable");
		});
	try {
		const result = await rename.action({
			request: new Request("http://localhost/files/rename", {
				method: "POST",
				headers: { Cookie: cookie, Origin: "http://localhost" },
				body: new URLSearchParams({
					path: "sync-source.txt",
					newName: "sync-moved.txt",
				}),
			}),
		} as Parameters<typeof rename.action>[0]);
		expect(result.success).toBe(true);
		expect(result.error).toBeUndefined();
		expect(result.warning).toContain("The file operation succeeded");
		expect(await fs.readFile(path.join(files, "sync-moved.txt"), "utf8")).toBe(
			"contents",
		);
		expect(
			(
				await shareRoute.loader(
					shareArgs(new Request(`http://localhost/s/${id}`), id),
				)
			).status,
		).toBe(404);
	} finally {
		sync.mockRestore();
	}
});

it("guards move and copy routes before mutations and rejects cross-origin requests", async () => {
	for (const operation of ["move", "copy"] as const) {
		const invoke = async (request: Request) => {
			if (operation === "move") {
				const route = await import("../routes/files-move");
				return route.action({ request } as Parameters<typeof route.action>[0]);
			}
			const route = await import("../routes/files-copy");
			return route.action({ request } as Parameters<typeof route.action>[0]);
		};
		await expect(
			invoke(
				new Request(`http://localhost/files/${operation}`, { method: "POST" }),
			),
		).rejects.toMatchObject({ status: 401 });
		const result = await invoke(
			new Request(`http://localhost/files/${operation}`, {
				method: "POST",
				headers: { Cookie: cookie, Origin: "https://evil.example" },
				body: new URLSearchParams({ path: "file.txt", destination: "" }),
			}),
		);
		expect(result.error).toContain("Invalid request origin");
	}
});

it.each(["file", "folder"])(
	"moves a shared %s without breaking its link and copies it privately",
	async (kind) => {
		const move = await import("../routes/files-move");
		const copy = await import("../routes/files-copy");
		const { shareStore } = await import("../server/shares/runtime.server");
		const { publishFile } = await import("../server/shares/service.server");
		const files = config.CONFIG.filesDir;
		const source = `transfer-${kind}`;
		const nested = kind === "folder" ? "/nested.txt" : "";
		if (kind === "folder") await fs.mkdir(path.join(files, source));
		await fs.writeFile(path.join(files, source + nested), "transfer contents");
		const destination = `destination-${kind}`;
		await fs.mkdir(path.join(files, destination));
		const id = await publishFile(shareStore, files, source + nested);
		const request = (operation: string, from: string, to: string) =>
			new Request(`http://localhost/files/${operation}`, {
				method: "POST",
				headers: { Cookie: cookie, Origin: "http://localhost" },
				body: new URLSearchParams({ path: from, destination: to }),
			});
		expect(
			await move.action({
				request: request("move", source, destination),
			} as Parameters<typeof move.action>[0]),
		).toEqual({ success: true });
		expect(shareStore.find(id)?.targetPath).toBe(
			`${destination}/${source}${nested}`,
		);
		const downloaded = await shareRoute.loader(
			shareArgs(new Request(`http://localhost/s/${id}`), id),
		);
		expect(downloaded.status).toBe(200);
		expect(await downloaded.text()).toBe("transfer contents");
		const count = shareStore.list().length;
		expect(
			await copy.action({
				request: request("copy", `${destination}/${source}`, ""),
			} as Parameters<typeof copy.action>[0]),
		).toEqual({ success: true });
		expect(shareStore.list()).toHaveLength(count);
		expect(shareStore.find(id)?.targetPath).toBe(
			`${destination}/${source}${nested}`,
		);
		const original = await fs.stat(
			path.join(files, destination, source + nested),
		);
		const copied = await fs.stat(path.join(files, source + nested));
		expect(copied.ino).not.toBe(original.ino);
		expect(await fs.readFile(path.join(files, source + nested), "utf8")).toBe(
			"transfer contents",
		);
	},
);
it("reports a completed move with a warning when share synchronization fails", async () => {
	const move = await import("../routes/files-move");
	const { shareStore } = await import("../server/shares/runtime.server");
	const files = config.CONFIG.filesDir;
	await fs.writeFile(path.join(files, "move-sync.txt"), "keep");
	await fs.mkdir(path.join(files, "move-sync-target"));
	const spy = vi.spyOn(shareStore, "renamePaths").mockImplementationOnce(() => {
		throw new Error("database unavailable");
	});
	try {
		const result = await move.action({
			request: new Request("http://localhost/files/move", {
				method: "POST",
				headers: { Cookie: cookie, Origin: "http://localhost" },
				body: new URLSearchParams({
					path: "move-sync.txt",
					destination: "move-sync-target",
				}),
			}),
		} as Parameters<typeof move.action>[0]);
		expect(result.success).toBe(true);
		expect(result.warning).toContain("The file operation succeeded");
		expect(
			await fs.readFile(
				path.join(files, "move-sync-target/move-sync.txt"),
				"utf8",
			),
		).toBe("keep");
	} finally {
		spy.mockRestore();
	}
});
