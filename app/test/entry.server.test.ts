import { afterEach, expect, it, vi } from "vitest";
import { handleError } from "../entry.server";
import { logger, requestLogContext } from "../server/logger.server";

afterEach(() => vi.restoreAllMocks());
it("records framework failures with request context and keeps cancellations at debug", () => {
	const errorLog = vi.spyOn(logger, "error").mockImplementation(() => {});
	const debugLog = vi.spyOn(logger, "debug").mockImplementation(() => {});
	const request = new Request("http://localhost/missing?token=hidden");
	const error = new Error("render failed");
	handleError(error, { request });
	expect(errorLog).toHaveBeenCalledWith(
		{
			...requestLogContext(request),
			component: "server",
			status: 500,
			err: error,
		},
		"Unhandled server error",
	);
	expect(JSON.stringify(errorLog.mock.calls)).not.toContain("hidden");
	const controller = new AbortController();
	controller.abort();
	handleError(error, {
		request: new Request("http://localhost/", { signal: controller.signal }),
	});
	expect(debugLog).toHaveBeenCalledWith(
		expect.objectContaining({ path: "/", component: "server" }),
		"Document request cancelled",
	);
	expect(errorLog).toHaveBeenCalledTimes(1);
});

it("records expected framework 4xx errors as warnings", () => {
	const warning = vi.spyOn(logger, "warn").mockImplementation(() => {});
	const errorLog = vi.spyOn(logger, "error").mockImplementation(() => {});
	handleError(new Response(null, { status: 404 }), {
		request: new Request("http://localhost/missing"),
	});
	expect(warning).toHaveBeenCalledWith(
		expect.objectContaining({ status: 404 }),
		"Unhandled server error",
	);
	expect(errorLog).not.toHaveBeenCalled();
});
