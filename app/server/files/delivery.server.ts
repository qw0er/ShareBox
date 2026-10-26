import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createReadableStreamFromReadable } from "@react-router/node";
import { logger } from "../logger.server";
import {
	INVALID_PATH_MESSAGE,
	resolveEntry,
	SYMLINK_MESSAGE,
} from "./paths.server";

type ByteRange = { start: number; end: number };

function parseRange(value: string | null, size: number): ByteRange | null {
	if (!value?.startsWith("bytes=")) return null;
	// Multiple ranges are ignored: serve the full representation instead of multipart.
	if (value.includes(",")) return null;
	const match = /^bytes=(\d*)-(\d*)$/.exec(value);
	if (!match || (!match[1] && !match[2])) return null;
	const first = match[1]
		? Number(match[1])
		: Math.max(0, size - Number(match[2]));
	const last =
		match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
	if (
		!Number.isSafeInteger(first) ||
		!Number.isSafeInteger(last) ||
		first > last ||
		first >= size ||
		(!match[1] && Number(match[2]) === 0)
	) {
		throw new Response(null, {
			status: 416,
			headers: { "Content-Range": `bytes */${size}` },
		});
	}
	return { start: first, end: last };
}

function downloadHeaders(
	name: string,
	size: number,
	lastModified: string,
	range: ByteRange | null,
) {
	const encodedName = encodeURIComponent(name).replace(
		/['()*]/g,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
	);
	const headers = new Headers({
		"Content-Type": "application/octet-stream",
		"Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodedName}`,
		"Content-Length": String(range ? range.end - range.start + 1 : size),
		"Accept-Ranges": "bytes",
		"Last-Modified": lastModified,
		"Cache-Control": "no-store",
		"X-Content-Type-Options": "nosniff",
	});
	if (range)
		headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
	return headers;
}

function errorCode(error: unknown) {
	return error instanceof Error && "code" in error
		? String((error as NodeJS.ErrnoException).code)
		: undefined;
}

function errorToResponse(error: unknown): Response {
	if (error instanceof Response) return error;
	const message = error instanceof Error ? error.message : "";
	if (message === INVALID_PATH_MESSAGE)
		return new Response("路径无效", { status: 400 });
	const code = errorCode(error);
	if (
		code === "ENOENT" ||
		code === "ENOTDIR" ||
		code === "ELOOP" ||
		code === "EISDIR" ||
		message === SYMLINK_MESSAGE ||
		message === "Unsupported file type"
	) {
		return new Response("文件不存在", { status: 404 });
	}
	return new Response("暂时无法读取文件，请稍后重试", { status: 500 });
}

async function fileOperation<T>(
	operation: string,
	relativePath: string,
	run: () => Promise<T>,
): Promise<T> {
	const startedAt = performance.now();
	try {
		const result = await run();
		logger.debug(
			{
				component: "download",
				operation,
				relativePath,
				durationMs: Math.round(performance.now() - startedAt),
			},
			"File response prepared",
		);
		return result;
	} catch (error) {
		const response = errorToResponse(error);
		logger[response.status >= 500 ? "error" : "warn"](
			{
				component: "download",
				operation,
				relativePath,
				status: response.status,
				durationMs: Math.round(performance.now() - startedAt),
				err: error instanceof Response ? undefined : error,
			},
			"File request failed",
		);
		throw response;
	}
}

/**
 * Stream one regular file below `rootDir` as an attachment.
 *
 * Access control belongs to the caller: the authenticated download route and
 * the share route both authorize before calling this function.
 */
export async function deliverFile(
	rootDir: string,
	relativePath: string,
	request: Request,
	component = "download",
	expectedIdentity?: { targetDev: string; targetIno: string },
): Promise<Response> {
	const { targetPath, targetStats } = await resolveEntry(rootDir, relativePath);
	if (!targetStats.isFile()) throw new Response("文件不存在", { status: 404 });

	// Do not follow a final-component link replaced between validation and open.
	const file = await fs.open(
		targetPath,
		constants.O_RDONLY | constants.O_NOFOLLOW,
	);
	try {
		if (expectedIdentity) {
			const identity = await file.stat({ bigint: true });
			if (
				identity.dev.toString() !== expectedIdentity.targetDev ||
				identity.ino.toString() !== expectedIdentity.targetIno
			) {
				throw new Response("文件不存在", { status: 404 });
			}
		}
		const current = await file.stat();
		if (!current.isFile()) throw new Response("文件不存在", { status: 404 });
		const lastModified = current.mtime.toUTCString();
		const ifRange = request.headers.get("If-Range");
		const range = parseRange(
			ifRange && ifRange !== lastModified ? null : request.headers.get("Range"),
			current.size,
		);
		const headers = downloadHeaders(
			path.basename(targetPath),
			current.size,
			lastModified,
			range,
		);
		if (request.method === "HEAD" || current.size === 0) {
			await file.close();
			return new Response(null, { status: range ? 206 : 200, headers });
		}
		const stream = file.createReadStream({
			...range,
			autoClose: true,
			signal: request.signal,
		});
		const downloadLogger = logger.child({
			component,
			operation: "download",
			relativePath,
			method: request.method,
			status: range ? 206 : 200,
			expectedBytes: range ? range.end - range.start + 1 : current.size,
		});
		const startedAt = performance.now();
		let ended = false;
		let failed = false;
		downloadLogger.info("Download stream started");
		stream.once("end", () => {
			ended = true;
		});
		stream.once("error", (error) => {
			failed = true;
			downloadLogger[
				request.signal.aborted || error.name === "AbortError"
					? "debug"
					: "error"
			](
				{
					err: error,
					bytesRead: stream.bytesRead,
					durationMs: Math.round(performance.now() - startedAt),
				},
				"Download stream interrupted",
			);
		});
		stream.once("close", () => {
			if (!failed)
				downloadLogger[ended ? "info" : "debug"](
					{
						bytesRead: stream.bytesRead,
						durationMs: Math.round(performance.now() - startedAt),
					},
					ended ? "Download stream finished" : "Download stream cancelled",
				);
		});
		return new Response(createReadableStreamFromReadable(stream), {
			status: range ? 206 : 200,
			headers,
		});
	} catch (error) {
		await file.close();
		throw error;
	}
}

/** Authenticated download entry point used by `/download?path=...`. */
export async function downloadRequestedFile(
	rootDir: string,
	request: Request,
): Promise<Response> {
	const relativePath = new URL(request.url).searchParams.get("path") || "";
	return fileOperation("download", relativePath, async () => {
		if (!relativePath) throw new Response("请选择文件", { status: 400 });
		return deliverFile(rootDir, relativePath, request);
	});
}
