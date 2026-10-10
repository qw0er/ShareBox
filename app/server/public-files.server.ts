import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createReadableStreamFromReadable } from "@react-router/node";
import { publicDownloadUrl } from "~/utils/public-links";
import { logger } from "./logger.server";
import { checkRootDirectory } from "./utils.server";

export type PublicEntry = {
	name: string;
	path: string;
	type: "directory" | "file";
	size: number;
	modifiedAt: string;
	downloadUrl: string | null;
};

async function resolvePublicEntry(root: string, relativePath: string) {
	if (
		path.isAbsolute(relativePath) ||
		path.win32.isAbsolute(relativePath) ||
		relativePath.includes("\\")
	) {
		throw new Response("路径无效", { status: 400 });
	}
	const segments = relativePath ? relativePath.split("/") : [];
	if (
		segments.some(
			(segment) =>
				!segment ||
				segment === "." ||
				segment === ".." ||
				segment.includes("\0"),
		)
	) {
		throw new Response("路径无效", { status: 400 });
	}
	let target = path.resolve(root);
	await checkRootDirectory(target);
	let stats = await fs.lstat(target);
	for (const segment of segments) {
		target = path.join(target, segment);
		stats = await fs.lstat(target);
		if (stats.isSymbolicLink())
			throw new Response("文件或目录不存在", { status: 404 });
	}
	return { target, stats };
}

export async function readPublicDirectory(root: string, relativePath: string) {
	return publicOperation("list", relativePath, async () => {
		const { target, stats } = await resolvePublicEntry(root, relativePath);
		if (!stats.isDirectory()) throw new Response("目录不存在", { status: 404 });
		const names = await fs.readdir(target);
		const entries: PublicEntry[] = [];
		for (const name of names) {
			try {
				const entryStats = await fs.lstat(path.join(target, name));
				if (!entryStats.isFile() && !entryStats.isDirectory()) continue;
				const entryPath = relativePath ? `${relativePath}/${name}` : name;
				entries.push({
					name,
					path: entryPath,
					type: entryStats.isDirectory() ? "directory" : "file",
					size: entryStats.size,
					modifiedAt: entryStats.mtime.toISOString(),
					downloadUrl: entryStats.isFile()
						? publicDownloadUrl(entryPath)
						: null,
				});
			} catch (error) {
				if (errorCode(error) !== "ENOENT") throw error;
			}
		}
		entries.sort((a, b) =>
			a.type === b.type
				? a.name.localeCompare(b.name)
				: a.type === "directory"
					? -1
					: 1,
		);
		return { path: relativePath, entries };
	});
}

function errorCode(error: unknown) {
	return error instanceof Error && "code" in error
		? String(error.code)
		: undefined;
}

async function publicOperation<T>(
	operation: string,
	relativePath: string,
	run: () => Promise<T>,
): Promise<T> {
	const startedAt = Date.now();
	try {
		const result = await run();
		logger.debug(
			{
				component: "public-files",
				operation,
				relativePath,
				durationMs: Date.now() - startedAt,
			},
			"Public file response prepared",
		);
		return result;
	} catch (error) {
		const code = errorCode(error);
		const response =
			error instanceof Response
				? error
				: new Response(
						code === "ENOENT" || code === "ENOTDIR"
							? "文件或目录不存在"
							: "暂时无法读取文件，请稍后重试",
						{ status: code === "ENOENT" || code === "ENOTDIR" ? 404 : 500 },
					);
		logger[response.status >= 500 ? "error" : "warn"](
			{
				component: "public-files",
				operation,
				relativePath,
				status: response.status,
				durationMs: Date.now() - startedAt,
				err: error instanceof Response ? undefined : error,
			},
			"Public file request failed",
		);
		throw response;
	}
}

function parseRange(value: string | null, size: number) {
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
	range: ReturnType<typeof parseRange>,
) {
	const encodedName = encodeURIComponent(name).replace(
		/['()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
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

export async function downloadPublicFile(root: string, request: Request) {
	const relativePath = new URL(request.url).searchParams.get("path") || "";
	return publicOperation("download", relativePath, async () => {
		if (!relativePath) throw new Response("请选择文件", { status: 400 });
		const { target, stats } = await resolvePublicEntry(root, relativePath);
		if (!stats.isFile()) throw new Response("文件不存在", { status: 404 });
		// Do not follow a final-component link replaced between validation and open.
		const file = await fs.open(
			target,
			constants.O_RDONLY | constants.O_NOFOLLOW,
		);
		try {
			const current = await file.stat();
			if (!current.isFile()) throw new Response("文件不存在", { status: 404 });
			const lastModified = current.mtime.toUTCString();
			const ifRange = request.headers.get("If-Range");
			const range = parseRange(
				ifRange && ifRange !== lastModified
					? null
					: request.headers.get("Range"),
				current.size,
			);
			const headers = downloadHeaders(
				path.basename(target),
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
				component: "public-files",
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
			stream.once("error", (err) => {
				failed = true;
				downloadLogger[
					request.signal.aborted || err.name === "AbortError"
						? "debug"
						: "error"
				](
					{
						err,
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
	});
}
