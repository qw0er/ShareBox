import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { readAuthConfig } from "../server/auth-config.server";
import {
	hashPassword,
	isPasswordHash,
	verifyPassword,
} from "../server/password.server";

vi.mock("../server/config.server", () => ({ CONFIG: { adminHost: "" } }));
vi.mock("../server/logger.server", async (importOriginal) => ({
	...(await importOriginal<typeof import("../server/logger.server")>()),
	logger: { debug: vi.fn(), fatal: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.stubEnv("ADMIN_USERNAME", undefined);
vi.stubEnv("ADMIN_PASSWORD_HASH", undefined);
vi.stubEnv("SESSION_SECRET", undefined);
afterAll(() => vi.unstubAllEnvs());
const { createAuth, getAuth } = await import("../server/auth.server");
let passwordHash: string;
beforeAll(async () => {
	passwordHash = await hashPassword("test-password");
});
afterEach(() => vi.useRealTimers());
const settings = () => ({
	username: "admin",
	passwordHash,
	secret: "test-secret-that-is-at-least-32-bytes",
	secure: false,
});
function request(method = "GET", cookie?: string, path = "/") {
	return new Request(`http://localhost${path}`, {
		method,
		headers: {
			...(cookie ? { Cookie: cookie } : {}),
			...(method === "POST" ? { Origin: "http://localhost" } : {}),
		},
	});
}
function loginRequest(
	password = "test-password",
	username = "admin",
	origin = "http://localhost",
) {
	return new Request("http://localhost/login", {
		method: "POST",
		headers: { Origin: origin },
		body: new URLSearchParams({ username, password }),
	});
}
async function loginCookie(auth: ReturnType<typeof createAuth>) {
	const response = await auth.login(loginRequest());
	if (!(response instanceof Response))
		throw new Error("Expected login redirect");
	const cookie = response.headers.get("Set-Cookie");
	if (!cookie) throw new Error("Expected session cookie");
	expect(response.status).toBe(303);
	expect(response.headers.get("Location")).toBe("/");
	expect(cookie).toContain("HttpOnly");
	expect(cookie).toContain("SameSite=Lax");
	expect(cookie).toContain("Max-Age=604800");
	return cookie.split(";")[0];
}

describe("scrypt credentials and configuration", () => {
	it("hashes with a unique salt and verifies passwords", async () => {
		expect(isPasswordHash(passwordHash)).toBe(true);
		expect(await hashPassword("test-password")).not.toBe(passwordHash);
		expect(await verifyPassword("test-password", passwordHash)).toBe(true);
		expect(await verifyPassword("wrong", passwordHash)).toBe(false);
		expect(await verifyPassword("test-password", "invalid")).toBe(false);
		expect(await verifyPassword("x".repeat(1025), passwordHash)).toBe(false);
	});
	it("requires complete valid configuration in production and rejects partial development configuration", () => {
		expect(() => readAuthConfig({}, true)).toThrow("Configure");
		expect(readAuthConfig({}, false)).toBeUndefined();
		expect(() => readAuthConfig({ ADMIN_USERNAME: "admin" }, false)).toThrow(
			"Configure",
		);
		expect(() =>
			readAuthConfig(
				{
					ADMIN_USERNAME: "admin",
					ADMIN_PASSWORD_HASH: passwordHash,
					SESSION_SECRET: "short",
				},
				true,
			),
		).toThrow("Configure");
		expect(() =>
			readAuthConfig(
				{
					ADMIN_USERNAME: "admin",
					ADMIN_PASSWORD_HASH: "invalid",
					SESSION_SECRET: settings().secret,
				},
				true,
			),
		).toThrow("Configure");
		expect(
			readAuthConfig(
				{
					ADMIN_USERNAME: "admin",
					ADMIN_PASSWORD_HASH: passwordHash,
					SESSION_SECRET: settings().secret,
				},
				true,
			)?.secure,
		).toBe(true);
	});
	it("never bypasses authentication when development credentials are missing", () => {
		expect(getAuth).toThrow();
	});
});

describe("signed cookie authentication", () => {
	it("allows an authenticated administrator and rejects unsigned or tampered cookies", async () => {
		const auth = createAuth(settings());
		const cookie = await loginCookie(auth);
		expect(await auth.isAuthenticated(request("GET", cookie))).toBe(true);
		await expect(
			auth.requireAdmin(request("POST", cookie)),
		).resolves.toBeUndefined();
		expect(await auth.isAuthenticated(request())).toBe(false);
		expect(
			await auth.isAuthenticated(request("GET", `${cookie}tampered`)),
		).toBe(false);
		expect(
			await auth.isAuthenticated(request("GET", "sharebox-session=fake")),
		).toBe(false);
	});
	it("checks expiration on the server and keeps sessions across service recreation", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-10T00:00:00Z"));
		const auth = createAuth(settings());
		const cookie = await loginCookie(auth);
		expect(
			await createAuth(settings()).isAuthenticated(request("GET", cookie)),
		).toBe(true);
		vi.setSystemTime(new Date("2026-10-17T00:00:00Z"));
		expect(await auth.isAuthenticated(request("GET", cookie))).toBe(false);
	});
	it("invalidates old sessions after a password or signing secret change", async () => {
		const cookie = await loginCookie(createAuth(settings()));
		const newHash = await hashPassword("changed-password");
		expect(
			await createAuth({
				...settings(),
				passwordHash: newHash,
			}).isAuthenticated(request("GET", cookie)),
		).toBe(false);
		expect(
			await createAuth({
				...settings(),
				secret: "another-secret-that-is-at-least-32-bytes",
			}).isAuthenticated(request("GET", cookie)),
		).toBe(false);
	});
	it("returns a redirect for page access and 401 for API access", async () => {
		const auth = createAuth(settings());
		await expect(auth.requireAdmin(request(), true)).rejects.toMatchObject({
			status: 302,
		});
		for (const method of [
			"GET",
			"HEAD",
			"OPTIONS",
			"POST",
			"PATCH",
			"DELETE",
		]) {
			await expect(
				auth.requireAdmin(request(method, undefined, "/uploads/id")),
			).rejects.toMatchObject({ status: 401 });
		}
	});
	it("uses a Secure host-only cookie in production and clears it on logout", async () => {
		const auth = createAuth({ ...settings(), secure: true });
		const response = await auth.login(loginRequest());
		expect(response).toBeInstanceOf(Response);
		if (!(response instanceof Response)) throw new Error("Expected redirect");
		expect(response.headers.get("Set-Cookie")).toContain(
			"__Host-sharebox-session=",
		);
		expect(response.headers.get("Set-Cookie")).toContain("Secure");
		const cleared = await auth.logout(request("POST"));
		expect(cleared.headers.get("Location")).toBe("/login");
		expect(cleared.headers.get("Set-Cookie")).toContain(
			"Expires=Thu, 01 Jan 1970",
		);
		expect(
			await auth.isAuthenticated(request("GET", "__Host-sharebox-session=")),
		).toBe(false);
	});
	it("rejects invalid credentials, malformed forms and cross-origin authentication", async () => {
		const auth = createAuth(settings());
		for (const input of [
			loginRequest("wrong"),
			loginRequest("test-password", "wrong"),
		]) {
			const result = await auth.login(input);
			expect(result).toMatchObject({
				data: { error: "用户名或密码错误。" },
				init: { status: 400 },
			});
		}
		const malformed = await auth.login(
			new Request("http://localhost/login", {
				method: "POST",
				headers: { Origin: "http://localhost" },
				body: "bad",
			}),
		);
		expect(malformed).toMatchObject({ init: { status: 400 } });
		await expect(
			auth.login(
				loginRequest("test-password", "admin", "https://evil.example"),
			),
		).rejects.toMatchObject({ status: 403 });
		await expect(
			auth.logout(new Request("http://localhost/logout", { method: "POST" })),
		).rejects.toMatchObject({ status: 403 });
		await expect(auth.logout(request())).rejects.toMatchObject({ status: 403 });
	});
	it("bounds login attempts and allows login after the limit window", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-10T00:00:00Z"));
		const auth = createAuth(settings());
		for (let index = 0; index < 10; index++)
			await auth.login(loginRequest("wrong"));
		expect(await auth.login(loginRequest())).toMatchObject({
			init: { status: 429 },
		});
		vi.setSystemTime(new Date("2026-10-10T00:15:00Z"));
		expect(await auth.login(loginRequest())).toBeInstanceOf(Response);
	});
});

it("rejects oversized login bodies before password verification", async () => {
	const auth = createAuth(settings());
	const result = await auth.login(loginRequest("x".repeat(17000)));
	expect(result).toMatchObject({
		data: { error: "登录表单无效，请刷新页面后重新填写。" },
		init: { status: 400 },
	});
});
