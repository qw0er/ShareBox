import { createHmac } from "node:crypto";
import { createCookieSessionStorage, data, redirect } from "react-router";
import {
	initializeAdministrator,
	replaceAdministratorPassword,
} from "./administrator.server";
import { CONFIG, DATABASE } from "./config.server";
import { logger } from "./logger.server";
import { readLoginForm } from "./login-form.server";
import { hashPassword, verifyPassword } from "./password.server";

const config = await loadAuthConfig();
async function loadAuthConfig() {
	try {
		const credentials = await initializeAdministrator(DATABASE);
		const settings = { ...credentials, secure: import.meta.env.PROD };
		logger.info(
			{ component: "auth", secureCookie: settings.secure },
			"Authentication configured",
		);
		return settings;
	} catch {
		logger.fatal({ component: "auth" }, "Authentication configuration invalid");
		throw new Error(
			"Authentication initialization failed; check state database permissions, or stop the application and run npm run auth:reset",
		);
	}
}
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const WINDOW_MS = 15 * 60 * 1000;

export function createAuth(
	initialSettings: NonNullable<typeof config>,
	savePassword = (oldHash: string, newHash: string) =>
		replaceAdministratorPassword(DATABASE, oldHash, newHash),
) {
	const settings = { ...initialSettings };
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
	const getVersion = () =>
		createHmac("sha256", settings.secret)
			.update(settings.username)
			.update("\0")
			.update(settings.passwordHash)
			.digest("hex");
	let attempts = 0;
	let windowStart = 0;
	let changeAttempts = 0;
	let changeWindowStart = 0;
	async function isAuthenticated(request: Request) {
		const session = await storage.getSession(request.headers.get("Cookie"));
		return (
			session.get("user") === settings.username &&
			session.get("version") === getVersion() &&
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
		throw new Response(
			"Your session has expired or you are not signed in. Please sign in again.",
			{
				status: 401,
				headers: { "Cache-Control": "no-store", "Tus-Resumable": "1.0.0" },
			},
		);
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
				{ error: "Too many login attempts. Please try again later." },
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
				{ error: "Invalid login form. Refresh the page and try again." },
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
				{ error: "Incorrect username or password." },
				{ status: 400, headers: { "Cache-Control": "no-store" } },
			);
		}
		attempts = 0;
		const session = await storage.getSession();
		session.set("user", settings.username);
		session.set("expiresAt", Date.now() + SESSION_SECONDS * 1000);
		session.set("version", getVersion());
		logger.info({ component: "auth" }, "Administrator logged in");
		return redirect("/", {
			status: 303,
			headers: {
				"Set-Cookie": await storage.commitSession(session),
				"Cache-Control": "no-store",
			},
		});
	}
	async function changePassword(request: Request) {
		await requireAdmin(request);
		assertAuthOrigin(request);
		const now = Date.now();
		if (now - changeWindowStart >= WINDOW_MS) {
			changeWindowStart = now;
			changeAttempts = 0;
		}
		if (changeAttempts >= 10) {
			logger.warn({ component: "auth" }, "Password change rate limit reached");
			return data(
				{ error: "Too many attempts. Please try again later." },
				{ status: 429 },
			);
		}
		changeAttempts++;
		let form: URLSearchParams;
		try {
			form = await readLoginForm(request);
		} catch {
			logger.warn(
				{ component: "auth" },
				"Rejected invalid password change form",
			);
			return data(
				{ error: "Invalid form. Refresh the page and try again." },
				{ status: 400 },
			);
		}
		const current = form.get("currentPassword");
		const next = form.get("newPassword");
		const confirmation = form.get("confirmPassword");
		if (
			!current ||
			!next ||
			next.length < 8 ||
			next.length > 1024 ||
			next !== confirmation
		) {
			return data(
				{
					error:
						"The new password must be 8 to 1024 characters and both entries must match.",
				},
				{ status: 400 },
			);
		}
		const oldHash = settings.passwordHash;
		if (!(await verifyPassword(current, oldHash))) {
			logger.warn(
				{ component: "auth" },
				"Password change rejected: incorrect current password",
			);
			return data({ error: "Incorrect current password." }, { status: 400 });
		}
		const newHash = await hashPassword(next);
		if (!savePassword(oldHash, newHash)) {
			logger.warn(
				{ component: "auth" },
				"Password change rejected: credentials changed concurrently",
			);
			return data(
				{ error: "The password has changed. Sign in again and retry." },
				{ status: 409 },
			);
		}
		settings.passwordHash = newHash;
		changeAttempts = 0;
		logger.info(
			{ component: "auth" },
			"Administrator password changed; sessions invalidated",
		);
		return logout(request);
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
	return { isAuthenticated, requireAdmin, login, logout, changePassword };
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
		throw new Response(
			"Invalid request origin or method. Please try again from the login page.",
			{
				status: 403,
			},
		);
	}
}
const configuredAuth = createAuth(config);
export function getAuth() {
	return configuredAuth;
}
