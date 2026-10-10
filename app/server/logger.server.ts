import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import pino, { type DestinationStream } from "pino";

const requestContext = new AsyncLocalStorage<{
	requestId: string;
	method: string;
	path: string;
}>();
const contexts = new WeakMap<
	Request,
	{ requestId: string; method: string; path: string }
>();

export function requestLogContext(request: Request) {
	let context = contexts.get(request);
	if (!context) {
		context = {
			requestId: randomUUID(),
			method: request.method,
			path: new URL(request.url).pathname,
		};
		contexts.set(request, context);
	}
	return context;
}

export const LOGGER_LEVEL = process.env.LOGGER_LEVEL || "info";

export function createLogger(
	destination: DestinationStream = process.stdout,
	level = LOGGER_LEVEL,
) {
	return pino(
		{
			level,
			name: "sharebox",
			redact: {
				paths: [
					"password",
					"passwordHash",
					"secret",
					"cookie",
					"authorization",
					"headers.cookie",
					"headers.authorization",
					'headers["set-cookie"]',
					"req.headers.cookie",
					"req.headers.authorization",
				],
				censor: "[REDACTED]",
			},
			mixin: () => ({ ...requestContext.getStore() }),
		},
		destination,
	);
}
export const logger = createLogger();

// One boundary for loaders/actions; never record query strings, headers or bodies.
export function withRequestLogging<T>(
	request: Request,
	component: string,
	run: () => Promise<T> | T,
): Promise<T> {
	const context = requestLogContext(request);
	return requestContext.run(context, async () => {
		const startedAt = performance.now();
		logger.debug({ component }, "Request started");
		try {
			const result = await run();
			const status = request.signal.aborted ? 499 : resultStatus(result);
			const rejected = !!(
				result &&
				typeof result === "object" &&
				"error" in result &&
				result.error
			);
			logger[
				status === 499
					? "debug"
					: status >= 500
						? "error"
						: status >= 400 || rejected
							? "warn"
							: "info"
			](
				{
					component,
					status,
					outcome:
						status === 499
							? "cancelled"
							: status >= 500
								? "failed"
								: status >= 400 || rejected
									? "rejected"
									: "completed",
					durationMs: Math.round(performance.now() - startedAt),
				},
				"Request completed",
			);
			return result;
		} catch (err) {
			const status =
				err instanceof Response
					? err.status
					: request.signal.aborted
						? 499
						: 500;
			logger[
				status === 499
					? "debug"
					: status >= 500
						? "error"
						: status >= 400
							? "warn"
							: "info"
			](
				{
					component,
					status,
					err: err instanceof Response ? undefined : err,
					durationMs: Math.round(performance.now() - startedAt),
				},
				status < 400 ? "Request redirected" : "Request failed",
			);
			throw err;
		}
	});
}

function resultStatus(result: unknown): number {
	if (result instanceof Response) return result.status;
	if (result && typeof result === "object" && "init" in result) {
		return (result.init as { status?: number } | undefined)?.status ?? 200;
	}
	return 200;
}

// Timers and background cleanup must not inherit the first triggering request.
export function withoutRequestLogging<T>(run: () => T): T {
	return requestContext.exit(run);
}
