import { data, redirect } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	createLogger,
	logger,
	withoutRequestLogging,
	withRequestLogging,
} from "../server/logger.server";

let records: Record<string, unknown>[];
beforeEach(() => {
	records = [];
	const capture = createLogger(
		{
			write: (line) => {
				records.push(JSON.parse(line));
			},
		},
		"trace",
	);
	for (const level of [
		"trace",
		"debug",
		"info",
		"warn",
		"error",
		"fatal",
	] as const) {
		vi.spyOn(logger, level).mockImplementation(capture[level].bind(capture));
	}
});
afterEach(() => vi.restoreAllMocks());

it("isolates concurrent request context and omits credentials and query strings", async () => {
	let release!: () => void;
	const waiting = new Promise<void>((resolve) => {
		release = resolve;
	});
	const first = withRequestLogging(
		new Request("http://localhost/first?password=hidden"),
		"test",
		async () => {
			await waiting;
			logger.info(
				{
					marker: "first",
					password: "hidden",
					headers: {
						cookie: "session=hidden",
						authorization: "Bearer hidden",
						"set-cookie": "hidden",
					},
				},
				"Inside first request",
			);
		},
	);
	await withRequestLogging(
		new Request("http://localhost/second"),
		"test",
		() => {
			logger.info({ marker: "second" }, "Inside second request");
		},
	);
	release();
	await first;
	const one = records.find((record) => record.marker === "first");
	const two = records.find((record) => record.marker === "second");
	if (!one || !two) throw new Error("Missing concurrent request logs");
	expect(one).toMatchObject({
		path: "/first",
		method: "GET",
		password: "[REDACTED]",
	});
	expect(one.requestId).toEqual(expect.any(String));
	expect(one.requestId).not.toBe(two.requestId);
	expect(JSON.stringify(records)).not.toContain("hidden");
	expect(
		records
			.filter((record) => record.path === "/first")
			.every((record) => record.requestId === one.requestId),
	).toBe(true);
	expect(
		records
			.filter((record) => record.msg === "Request completed")
			.every(
				(record) =>
					record.marker === undefined && record.password === undefined,
			),
	).toBe(true);
	logger.info("Outside request");
	expect(records.at(-1)?.requestId).toBeUndefined();
});

it.each([200, 404, 500])(
	"records status %i with the appropriate severity without changing the response",
	async (status) => {
		const response = new Response(null, { status });
		expect(
			await withRequestLogging(
				new Request("http://localhost/"),
				"test",
				() => response,
			),
		).toBe(response);
		expect(records.at(-1)).toMatchObject({
			status,
			level: status >= 500 ? 50 : status >= 400 ? 40 : 30,
			durationMs: expect.any(Number),
		});
	},
);
it("keeps redirects and unexpected exceptions intact while logging their results", async () => {
	const response = redirect("/login");
	await expect(
		withRequestLogging(new Request("http://localhost/"), "test", () => {
			throw response;
		}),
	).rejects.toBe(response);
	expect(records.at(-1)).toMatchObject({ status: 302, level: 30 });
	const error = new Error("disk failed");
	await expect(
		withRequestLogging(new Request("http://localhost/"), "test", () => {
			throw error;
		}),
	).rejects.toBe(error);
	expect(records.at(-1)).toMatchObject({
		status: 500,
		level: 50,
		err: { message: "disk failed" },
	});
});
it("recognizes React Router data status and business rejections", async () => {
	const result = data({ error: "too many attempts" }, { status: 429 });
	expect(
		await withRequestLogging(
			new Request("http://localhost/"),
			"test",
			() => result,
		),
	).toBe(result);
	expect(records.at(-1)).toMatchObject({ status: 429, level: 40 });
	await withRequestLogging(new Request("http://localhost/"), "test", () => ({
		error: "invalid filename",
	}));
	expect(records.at(-1)).toMatchObject({
		status: 200,
		outcome: "rejected",
		level: 40,
	});
});
it("keeps client cancellation out of server-error logs", async () => {
	const controller = new AbortController();
	controller.abort();
	await expect(
		withRequestLogging(
			new Request("http://localhost/", { signal: controller.signal }),
			"test",
			() => {
				controller.signal.throwIfAborted();
			},
		),
	).rejects.toBeDefined();
	expect(records.at(-1)).toMatchObject({ status: 499, level: 20 });
});
it("filters normal events when the configured threshold is warn", () => {
	const lines: string[] = [];
	const log = createLogger(
		{
			write: (line) => {
				lines.push(line);
			},
		},
		"warn",
	);
	log.info("normal");
	log.warn("rejected");
	log.error({ secret: "hidden", passwordHash: "hidden" }, "failed");
	expect(lines.map((line) => JSON.parse(line).level)).toEqual([40, 50]);
	expect(lines.join("")).not.toContain("hidden");
});

it("detaches background jobs from the triggering request", async () => {
	await withRequestLogging(
		new Request("http://localhost/uploads"),
		"test",
		async () => {
			await withoutRequestLogging(
				() =>
					new Promise<void>((resolve) =>
						setTimeout(() => {
							logger.info("Background cleanup");
							resolve();
						}, 0),
					),
			);
			logger.info("Request continues");
		},
	);
	expect(
		records.find((record) => record.msg === "Background cleanup")?.requestId,
	).toBeUndefined();
	expect(
		records.find((record) => record.msg === "Request continues")?.requestId,
	).toEqual(expect.any(String));
});
