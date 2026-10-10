import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { hashPassword } from "../server/password.server";

vi.mock("../server/config.server", () => ({
	CONFIG: { adminHost: "", datadir: "/unused", maxUploadBytes: 100 },
}));
vi.mock("../server/logger.server", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../server/read-files.server", () => ({
	getFileTree: vi.fn(async () => []),
}));
vi.mock("../server/file-actions.server", () => ({
	handleFileAction: vi.fn(async () => ({ success: true })),
}));
vi.mock("../server/tus.server", () => ({
	handleTusRequest: vi.fn(async () => new Response(null, { status: 204 })),
}));
let home: typeof import("../routes/home");
let uploads: typeof import("../routes/uploads");
let auth: ReturnType<typeof import("../server/auth.server").getAuth>;
beforeAll(async () => {
	vi.stubEnv("ADMIN_USERNAME", "admin");
	vi.stubEnv("ADMIN_PASSWORD_HASH", await hashPassword("route-password"));
	vi.stubEnv("SESSION_SECRET", "route-test-secret-at-least-32-bytes");
	home = await import("../routes/home");
	uploads = await import("../routes/uploads");
	auth = (await import("../server/auth.server")).getAuth();
});
afterAll(() => vi.unstubAllEnvs());
function uploadArgs(request: Request) {
	return { request } as Parameters<typeof uploads.loader>[0];
}
function args(request: Request) {
	return { request } as Parameters<typeof home.loader>[0];
}
it("guards home loaders and actions before reading or mutating files", async () => {
	const { getFileTree } = await import("../server/read-files.server");
	const { handleFileAction } = await import("../server/file-actions.server");
	await expect(
		home.loader(args(new Request("http://localhost/"))),
	).rejects.toMatchObject({ status: 302 });
	await expect(
		home.action(args(new Request("http://localhost/", { method: "POST" }))),
	).rejects.toMatchObject({ status: 401 });
	expect(getFileTree).not.toHaveBeenCalled();
	expect(handleFileAction).not.toHaveBeenCalled();
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
	expect(
		await home.action(
			args(
				new Request("http://localhost/", {
					method: "POST",
					headers: { Cookie: cookie },
				}),
			),
		),
	).toEqual({ success: true });
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
	expect(logout.loader).toThrow();
	try {
		logout.loader();
	} catch (response) {
		expect(response).toMatchObject({ status: 405 });
	}
	expect(login.headers()).toEqual({ "Cache-Control": "no-store" });
});
