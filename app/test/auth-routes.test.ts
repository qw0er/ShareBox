import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { hashPassword } from "../server/password.server";

const credentials = vi.hoisted(() => ({
	username: "admin",
	passwordHash: "",
	secret: "route-test-secret-at-least-32-bytes",
}));
vi.mock("../server/administrator.server", () => ({
	initializeAdministrator: async () => credentials,
}));
vi.mock("../server/config.server", () => ({
	DATABASE: {},
	CONFIG: {
		adminHost: "",
		filesDir: "/unused",
		stagingDir: "/unused",
		maxUploadBytes: 100,
	},
}));
vi.mock("../server/shares/runtime.server", () => ({
	shareStore: {
		list: vi.fn(() => []),
		renamePaths: vi.fn(),
		removePaths: vi.fn(),
	},
}));
vi.mock("../server/logger.server", async (importOriginal) => {
	const logger = {
		debug: vi.fn(),
		fatal: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		child: vi.fn(),
	};
	logger.child.mockReturnValue(logger);
	return {
		...(await importOriginal<typeof import("../server/logger.server")>()),
		logger,
	};
});
vi.mock("../server/files/repository.server", () => ({
	getFileTree: vi.fn(async () => []),
}));
vi.mock("../server/files/delivery.server", () => ({
	downloadRequestedFile: vi.fn(async () => new Response("file")),
}));
vi.mock("../server/remove-action.server", async (importOriginal) => ({
	...(await importOriginal<typeof import("../server/remove-action.server")>()),
	handleRemoveAction: vi.fn(async () => ({ success: true })),
}));
vi.mock("../server/rename-action.server", async (importOriginal) => ({
	...(await importOriginal<typeof import("../server/rename-action.server")>()),
	handleRenameAction: vi.fn(async () => ({ success: true })),
}));
vi.mock("../server/tus.server", () => ({
	handleTusRequest: vi.fn(async () => new Response(null, { status: 204 })),
}));
let home: typeof import("../routes/home");
let uploads: typeof import("../routes/uploads");
let download: typeof import("../routes/download");
let filesRemove: typeof import("../routes/files-remove");
let filesRename: typeof import("../routes/files-rename");
let auth: ReturnType<typeof import("../server/auth.server").getAuth>;
beforeAll(async () => {
	credentials.passwordHash = await hashPassword("route-password");
	home = await import("../routes/home");
	uploads = await import("../routes/uploads");
	download = await import("../routes/download");
	filesRemove = await import("../routes/files-remove");
	filesRename = await import("../routes/files-rename");
	auth = (await import("../server/auth.server")).getAuth();
});
afterAll(() => vi.unstubAllEnvs());
function uploadArgs(request: Request) {
	return { request } as Parameters<typeof uploads.loader>[0];
}
function args(request: Request) {
	return { request } as Parameters<typeof home.loader>[0];
}
function removeActionArgs(request: Request) {
	return { request } as Parameters<typeof filesRemove.action>[0];
}
function renameActionArgs(request: Request) {
	return { request } as Parameters<typeof filesRename.action>[0];
}
function downloadArgs(request: Request) {
	return { request } as Parameters<typeof download.loader>[0];
}
it("guards home, download and file action routes before reading or mutating files", async () => {
	const { getFileTree } = await import("../server/files/repository.server");
	const { downloadRequestedFile } = await import(
		"../server/files/delivery.server"
	);
	const { handleRemoveAction } = await import("../server/remove-action.server");
	const { handleRenameAction } = await import("../server/rename-action.server");
	await expect(
		home.loader(args(new Request("http://localhost/"))),
	).rejects.toMatchObject({ status: 302 });
	await expect(
		download.loader(
			downloadArgs(new Request("http://localhost/download?path=secret.txt")),
		),
	).rejects.toMatchObject({ status: 401 });
	await expect(
		filesRemove.action(
			removeActionArgs(
				new Request("http://localhost/files/remove", { method: "POST" }),
			),
		),
	).rejects.toMatchObject({ status: 401 });
	await expect(
		filesRename.action(
			renameActionArgs(
				new Request("http://localhost/files/rename", { method: "POST" }),
			),
		),
	).rejects.toMatchObject({ status: 401 });
	expect(getFileTree).not.toHaveBeenCalled();
	expect(downloadRequestedFile).not.toHaveBeenCalled();
	expect(handleRemoveAction).not.toHaveBeenCalled();
	expect(handleRenameAction).not.toHaveBeenCalled();
});
it("guards all tus methods before invoking the upload service", async () => {
	const { handleTusRequest } = await import("../server/tus.server");
	for (const method of ["GET", "HEAD", "OPTIONS", "POST", "PATCH", "DELETE"]) {
		const handler = ["GET", "HEAD"].includes(method)
			? uploads.loader
			: uploads.action;
		await expect(
			handler(
				uploadArgs(new Request("http://localhost/uploads/id", { method })),
			),
		).rejects.toMatchObject({ status: 401 });
	}
	expect(handleTusRequest).not.toHaveBeenCalled();
});
it("passes authenticated management and tus requests to their existing handlers", async () => {
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
		throw new Error("Expected login redirect");
	const cookie = response.headers.get("Set-Cookie")?.split(";")[0];
	if (!cookie) throw new Error("Expected cookie");
	expect(
		await home.loader(
			args(new Request("http://localhost/", { headers: { Cookie: cookie } })),
		),
	).toMatchObject({ fileTree: [] });
	const downloadResponse = await download.loader(
		downloadArgs(
			new Request("http://localhost/download?path=missing.txt", {
				headers: { Cookie: cookie },
			}),
		),
	);
	expect(downloadResponse.status).toBe(200);
	const { downloadRequestedFile } = await import(
		"../server/files/delivery.server"
	);
	expect(downloadRequestedFile).toHaveBeenCalledOnce();
	const actionHeaders = { Cookie: cookie, Origin: "http://localhost" };
	expect(
		await filesRemove.action(
			removeActionArgs(
				new Request("http://localhost/files/remove", {
					method: "POST",
					headers: actionHeaders,
					body: new URLSearchParams({ path: "missing.txt" }),
				}),
			),
		),
	).toEqual({ success: true });
	expect(
		await filesRename.action(
			renameActionArgs(
				new Request("http://localhost/files/rename", {
					method: "POST",
					headers: actionHeaders,
					body: new URLSearchParams({
						path: "missing.txt",
						newName: "renamed.txt",
					}),
				}),
			),
		),
	).toEqual({ success: true });
	const { handleRemoveAction } = await import("../server/remove-action.server");
	const { handleRenameAction } = await import("../server/rename-action.server");
	expect(handleRemoveAction).toHaveBeenCalledOnce();
	expect(handleRenameAction).toHaveBeenCalledOnce();
	expect(
		(
			await uploads.action(
				uploadArgs(
					new Request("http://localhost/uploads", {
						method: "POST",
						headers: { Cookie: cookie },
					}),
				),
			)
		).status,
	).toBe(204);
});

it("exposes the login page anonymously and requires POST for logout", async () => {
	const login = await import("../routes/login");
	const logout = await import("../routes/logout");
	await expect(
		login.loader({
			request: new Request("http://localhost/login"),
		} as Parameters<typeof login.loader>[0]),
	).resolves.toBeNull();
	await expect(
		logout.loader({
			request: new Request("http://localhost/logout"),
		} as Parameters<typeof logout.loader>[0]),
	).rejects.toMatchObject({ status: 405 });
	expect(login.headers()).toEqual({ "Cache-Control": "no-store" });
});
