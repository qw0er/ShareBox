import { createWriteStream } from "node:fs";
import {
	chmod,
	link,
	lstat,
	mkdir,
	mkdtemp,
	realpath,
	rm,
	stat,
} from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import busboy from "busboy";
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
	if ((await stat(root)).dev !== (await stat(resolvedTemp)).dev)
		throw new Error(
			"Temporary and data directories must use the same filesystem",
		);
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
			files: 1,
			fields: 2,
			parts: 4,
			fieldSize: 4096,
			fieldNameSize: 100,
			fileSize: CONFIG.maxUploadBytes + 1,
		},
	});
	const fields = new Map<string, string>();
	let directory: string | undefined;
	let filename: string | undefined;
	let size = 0;
	let failure: Error | undefined;
	let writing: Promise<void> = Promise.resolve();
	const source = Readable.fromWeb(
		request.body as NodeReadableStream<Uint8Array>,
	);
	const fail = (error: Error) => {
		failure ??= error;
		parser.destroy(error);
	};
	parser.on("filesLimit", () =>
		fail(new Error("Please upload exactly one file")),
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
		writing = (async () => {
			if (name !== "file") throw new Error("Invalid form data");
			validateFileName(info.filename);
			filename = info.filename;
			directory = await prepareTempDirectory();
			await pipeline(
				stream,
				new Transform({
					transform(chunk: Buffer, _encoding, callback) {
						size += chunk.length;
						callback(
							size > CONFIG.maxUploadBytes
								? new Error("File exceeds upload size limit")
								: null,
							chunk,
						);
					},
				}),
				createWriteStream(path.join(directory, "content"), {
					flags: "wx",
					mode: 0o600,
				}),
				{ signal: request.signal },
			);
			if (stream.truncated) throw new Error("File exceeds upload size limit");
		})().catch((error: Error) => {
			stream.destroy();
			fail(error);
		});
	});
	let total = 0;
	try {
		await pipeline(
			source,
			new Transform({
				transform(chunk: Buffer, _encoding, callback) {
					total += chunk.length;
					callback(
						total > CONFIG.maxUploadBytes + 65536
							? new Error("Request exceeds upload size limit")
							: null,
						chunk,
					);
				},
			}),
			parser,
			{ signal: request.signal },
		);
		await writing;
		if (failure) throw failure;
		return {
			fields,
			filename,
			size,
			async publish() {
				if (!directory || !filename) throw new Error("No file uploaded");
				const temporaryFile = path.join(directory, "content");
				const root = await lstat(CONFIG.datadir);
				if (!root.isDirectory() || root.isSymbolicLink())
					throw new Error("Invalid data directory");
				await chmod(temporaryFile, 0o644);
				request.signal.throwIfAborted();
				// link() is atomic and fails with EEXIST for files, directories and symlinks.
				// Unlike rename(), concurrent uploads can never replace the winner.
				await link(temporaryFile, path.join(CONFIG.datadir, filename));
			},
			cleanup: () => cleanup(directory),
		};
	} catch (error) {
		source.destroy();
		parser.destroy();
		await writing;
		await cleanup(directory);
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
