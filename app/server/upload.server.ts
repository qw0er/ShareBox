import { constants, createWriteStream } from "node:fs";
import {
	chmod,
	copyFile,
	lstat,
	mkdir,
	mkdtemp,
	realpath,
	rm,
} from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import busboy from "busboy";
import { MAX_UPLOAD_FILES } from "../types/files";
import { CONFIG } from "./config.server";
import { logger } from "./logger.server";

export function validateFileName(name: string) {
	if (!name || name === "." || name === ".." || /[\\/\0]/.test(name)) {
		throw new Error("Invalid file name");
	}
}

async function prepareTempDirectory() {
	const root = await realpath(CONFIG.datadir);
	const temp = path.resolve(CONFIG.tempdir || `${root}.tmp`);
	// Check both lexical and real paths, including symlink aliases.
	const overlaps = (a: string, b: string) =>
		a === b || a.startsWith(`${b}${path.sep}`);
	if (overlaps(temp, root) || overlaps(root, temp))
		throw new Error("Temporary directory must be separate from data directory");
	await mkdir(temp, { recursive: true, mode: 0o700 });
	const resolvedTemp = await realpath(temp);
	if (overlaps(resolvedTemp, root) || overlaps(root, resolvedTemp))
		throw new Error("Temporary directory must be separate from data directory");
	return mkdtemp(path.join(resolvedTemp, "upload-"));
}

/** Parse with backpressure; only small text fields are buffered. Publish after the entire form is valid. */
export async function parseFileForm(request: Request) {
	if (!request.body) throw new Error("Invalid form data");
	const parser = busboy({
		headers: { "content-type": request.headers.get("content-type") || "" },
		preservePath: true,
		defParamCharset: "utf8",
		limits: {
			files: MAX_UPLOAD_FILES,
			fields: 2,
			parts: MAX_UPLOAD_FILES + 3,
			fieldSize: 4096,
			fieldNameSize: 100,
			fileSize: CONFIG.maxUploadBytes + 1,
		},
	});
	const fields = new Map<string, string>();
	const files: { filename: string; size: number; directory?: string }[] = [];
	const streams: Readable[] = [];
	let failure: Error | undefined;
	const writing: Promise<void>[] = [];
	const source = Readable.fromWeb(
		request.body as NodeReadableStream<Uint8Array>,
	);
	const fail = (error: Error) => {
		failure ??= error;
		parser.destroy(error);
		for (const stream of streams) stream.destroy(error);
	};
	parser.on("filesLimit", () =>
		fail(new Error(`Please upload at most ${MAX_UPLOAD_FILES} files`)),
	);
	parser.on("fieldsLimit", () => fail(new Error("Invalid form data")));
	parser.on("partsLimit", () => fail(new Error("Invalid form data")));
	parser.on("field", (name, value, info) => {
		if (
			info.valueTruncated ||
			info.nameTruncated ||
			fields.has(name) ||
			!["intent", "path"].includes(name)
		) {
			fail(new Error("Invalid form data"));
		} else fields.set(name, value);
	});
	parser.on("file", (name, stream, info) => {
		// Attach error handling before any asynchronous setup.
		stream.on("error", () => {});
		streams.push(stream);
		const file = {
			filename: info.filename,
			size: 0,
			directory: undefined as string | undefined,
		};
		files.push(file);
		writing.push(
			(async () => {
				if (name !== "file") throw new Error("Invalid form data");
				validateFileName(info.filename);
				if (failure) throw failure;
				file.directory = await prepareTempDirectory();
				if (failure) throw failure;
				await pipeline(
					stream,
					new Transform({
						transform(chunk: Buffer, _encoding, callback) {
							file.size += chunk.length;
							callback(
								file.size > CONFIG.maxUploadBytes
									? new Error(
											`File exceeds upload size limit: ${file.filename}`,
										)
									: null,
								chunk,
							);
						},
					}),
					createWriteStream(path.join(file.directory, "content"), {
						flags: "wx",
						mode: 0o600,
					}),
					{ signal: request.signal },
				);
				if (stream.truncated)
					throw new Error(`File exceeds upload size limit: ${file.filename}`);
			})().catch((error: Error) => {
				stream.destroy();
				fail(error);
			}),
		);
	});
	let total = 0;
	try {
		await pipeline(
			source,
			new Transform({
				transform(chunk: Buffer, _encoding, callback) {
					total += chunk.length;
					callback(
						total >
							Math.min(
								Number.MAX_SAFE_INTEGER,
								(CONFIG.maxUploadBytes + 65536) * MAX_UPLOAD_FILES,
							)
							? new Error("Request exceeds upload size limit")
							: null,
						chunk,
					);
				},
			}),
			parser,
			{ signal: request.signal },
		);
		await Promise.all(writing);
		if (failure) throw failure;
		return {
			fields,
			files,
			async publish(file: (typeof files)[number]) {
				if (!file.directory || !file.filename)
					throw new Error("No file uploaded");
				const temporaryFile = path.join(file.directory, "content");
				const root = await lstat(CONFIG.datadir);
				if (!root.isDirectory() || root.isSymbolicLink())
					throw new Error("Invalid data directory");
				await chmod(temporaryFile, 0o644);
				request.signal.throwIfAborted();
				// Copy across mounts without replacing existing entries.
				// The destination is visible while copying; cleanup runs after publication settles.
				await copyFile(
					temporaryFile,
					path.join(CONFIG.datadir, file.filename),
					constants.COPYFILE_EXCL,
				);
			},
			cleanup: () => Promise.all(files.map((file) => cleanup(file.directory))),
		};
	} catch (error) {
		source.destroy();
		fail(error instanceof Error ? error : new Error("Invalid form data"));
		await Promise.all(writing);
		await Promise.all(files.map((file) => cleanup(file.directory)));
		throw failure ?? error;
	}
}

async function cleanup(directory: string | undefined) {
	if (!directory) return;
	try {
		await rm(directory, { recursive: true, force: true });
	} catch (error) {
		logger.error(
			{ err: error, directory },
			"Unable to clean upload temporary directory",
		);
	}
}
