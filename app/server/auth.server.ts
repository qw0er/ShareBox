import { createHmac } from "node:crypto";
import { createCookieSessionStorage, data, redirect } from "react-router";
import { readAuthConfig } from "./auth-config.server";
import { CONFIG } from "./config.server";
import { logger } from "./logger.server";
import { readLoginForm } from "./login-form.server";
import { verifyPassword } from "./password.server";

const config = loadAuthConfig();
function loadAuthConfig() {
	try {
		const settings = readAuthConfig(process.env, import.meta.env.PROD);
		logger[settings ? "info" : "warn"](
			{
				component: "auth",
				configured: !!settings,
				secureCookie: settings?.secure,
			},
			settings
				? "Authentication configured"
				: "Authentication configuration missing",
		);
		return settings;
	} catch (err) {
		logger.fatal(
			{ component: "auth", err },
			"Authentication configuration invalid",
		);
		throw err;
	}
}
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const WINDOW_MS = 15 * 60 * 1000;

export function createAuth(settings: NonNullable<typeof config>) {
	const storage = createCookieSessionStorage<{
		user: string;
		expiresAt: number;
		version: string;
	}>({
		cookie: {
			name: settings.secure ? "__Host-sharebox-session" : "sharebox-session",
			httpOnly: true,
			secure: settings.secure,
			sameSite: "lax",
			path: "/",
			maxAge: SESSION_SECONDS,
			secrets: [settings.secret],
		},
	});
	const version = createHmac("sha256", settings.secret)
		.update(settings.username)
		.update("\0")
		.update(settings.passwordHash)
		.digest("hex");
	let attempts = 0;
	let windowStart = 0;
	async function isAuthenticated(request: Request) {
		const session = await storage.getSession(request.headers.get("Cookie"));
		return (
			session.get("user") === settings.username &&
			session.get("version") === version &&
			typeof session.get("expiresAt") === "number" &&
			(session.get("expiresAt") ?? 0) > Date.now()
		);
	}
	async function requireAdmin(request: Request, redirectToLogin = false) {
		if (await isAuthenticated(request)) return;
		logger[redirectToLogin ? "debug" : "warn"](
			{ component: "auth", method: request.method },
			"Rejected unauthenticated management request",
		);
		if (redirectToLogin)
			throw redirect("/login", { headers: { "Cache-Control": "no-store" } });
		throw new Response("登录已过期或尚未登录，请重新登录后重试。", {
			status: 401,
			headers: { "Cache-Control": "no-store", "Tus-Resumable": "1.0.0" },
		});
	}
	async function login(request: Request) {
		assertAuthOrigin(request);
		const now = Date.now();
		if (now - windowStart >= WINDOW_MS) {
			windowStart = now;
			attempts = 0;
		}
		if (attempts >= 10) {
			logger.warn(
				{
					component: "auth",
					attempts,
					retryAfterSeconds: Math.ceil(
						(WINDOW_MS - (now - windowStart)) / 1000,
					),
				},
				"Login rate limit reached",
			);
			return data(
				{ error: "登录尝试过于频繁，请稍后重试。" },
				{
					status: 429,
					headers: {
						"Retry-After": String(
							Math.ceil((WINDOW_MS - (now - windowStart)) / 1000),
						),
						"Cache-Control": "no-store",
					},
				},
			);
		}
		attempts++;
		let form: URLSearchParams;
		try {
			form = await readLoginForm(request);
		} catch {
			logger.warn({ component: "auth" }, "Rejected invalid login form");
			return data(
				{ error: "登录表单无效，请刷新页面后重新填写。" },
				{ status: 400, headers: { "Cache-Control": "no-store" } },
			);
		}
		const username = form.get("username");
		const password = form.get("password");
		const validPassword =
			typeof password === "string" &&
			(await verifyPassword(password, settings.passwordHash));
		if (username !== settings.username || !validPassword) {
			logger.warn(
				{ component: "auth", attempts, reason: "invalid_credentials" },
				"Administrator login failed",
			);
			return data(
				{ error: "用户名或密码错误。" },
				{ status: 400, headers: { "Cache-Control": "no-store" } },
			);
		}
		attempts = 0;
		const session = await storage.getSession();
		session.set("user", settings.username);
		session.set("expiresAt", Date.now() + SESSION_SECONDS * 1000);
		session.set("version", version);
		logger.info({ component: "auth" }, "Administrator logged in");
		return redirect("/", {
			status: 303,
			headers: {
				"Set-Cookie": await storage.commitSession(session),
				"Cache-Control": "no-store",
			},
		});
	}
	async function logout(request: Request) {
		assertAuthOrigin(request);
		const session = await storage.getSession(request.headers.get("Cookie"));
		logger.info({ component: "auth" }, "Administrator logged out");
		return redirect("/login", {
			status: 303,
			headers: {
				"Set-Cookie": await storage.destroySession(session),
				"Cache-Control": "no-store",
			},
		});
	}
	return { isAuthenticated, requireAdmin, login, logout };
}

export function assertAuthOrigin(request: Request) {
	const expected = CONFIG.adminHost
		? `https://${CONFIG.adminHost}`
		: new URL(request.url).origin;
	if (request.method !== "POST" || request.headers.get("Origin") !== expected) {
		logger.warn(
			{ component: "auth", method: request.method },
			"Rejected authentication request origin or method",
		);
		throw new Response("请求来源或提交方式无效，请从本站登录页面重新操作。", {
			status: 403,
		});
	}
}
const configuredAuth = config ? createAuth(config) : undefined;
export function getAuth() {
	if (!configuredAuth)
		throw new Response(
			"请先配置 ADMIN_USERNAME、ADMIN_PASSWORD_HASH 和 SESSION_SECRET。",
			{ status: 503, headers: { "Cache-Control": "no-store" } },
		);
	return configuredAuth;
}
