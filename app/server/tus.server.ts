import { constants } from "node:fs";
import {
	chmod,
	copyFile,
	lstat,
	mkdir,
	readdir,
	readFile,
	realpath,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import { FileStore } from "@tus/file-store";
import { MemoryLocker, Server } from "@tus/server";
import { CONFIG } from "./config.server";
import { logger } from "./logger.server";

const TTL = 7 * 24 * 60 * 60 * 1000;
const idPattern = /^[a-f0-9]{32}$/;
type Receipt = { success: true; filename: string; size: number };
type Upload = Awaited<ReturnType<FileStore["getUpload"]>>;

function validateFileName(name: unknown): asserts name is string {
	if (
		typeof name !== "string" ||
		!name ||
		name === "." ||
		name === ".." ||
		/[\\/\0]/.test(name)
	) {
		throw { status_code: 400, body: "Invalid file name" };
	}
}

function uploadError(error: unknown) {
	const err = (typeof error === "object" && error !== null ? error : {}) as {
		code?: unknown;
		status_code?: unknown;
		body?: unknown;
	};
	return {
		status_code:
			err.code === "EEXIST"
				? 409
				: typeof err.status_code === "number" &&
						Number.isInteger(err.status_code) &&
						err.status_code >= 400 &&
						err.status_code <= 599
					? err.status_code
					: 500,
		body:
			err.code === "EEXIST"
				? "同名文件或目录已存在，未覆盖。"
				: typeof err.body === "string" && err.body
					? err.body
					: "上传未完成，请检查磁盘空间和权限后重试。",
	};
}

// Rules and conversions: no filesystem access, logging, or implicit clock reads.
function validateDirectoryLayout(publicRoot: string, tempRoot: string) {
	if (
		tempRoot === publicRoot ||
		tempRoot.startsWith(`${publicRoot}${path.sep}`) ||
		publicRoot.startsWith(`${tempRoot}${path.sep}`)
	) {
		throw new Error("Temporary directory must be separate from data directory");
	}
}

function parseUploadMetadata(upload: Pick<Upload, "metadata" | "size">) {
	const filename = upload.metadata?.filename || "";
	validateFileName(filename);
	if (upload.size === undefined)
		throw { status_code: 400, body: "Upload-Length is required" };
	return { filename, size: upload.size };
}

function isExpired(timestamp: number, now: number, ttl = TTL) {
	return now - timestamp > ttl;
}

function parseReceipt(
	value: unknown,
): Omit<Receipt, "size"> & { size?: number } {
	if (typeof value !== "object" || value === null)
		throw new Error("Invalid upload receipt");
	const receipt = value as Record<string, unknown>;
	validateFileName(receipt.filename);
	if (
		receipt.success !== true ||
		(receipt.size !== undefined &&
			(typeof receipt.size !== "number" ||
				!Number.isSafeInteger(receipt.size) ||
				receipt.size < 0))
	) {
		throw new Error("Invalid upload receipt");
	}
	return {
		success: true,
		filename: receipt.filename,
		size: receipt.size as number | undefined,
	};
}

function validateUploadRequest(input: {
	method: string;
	url: string;
	origin: string | null;
	adminHost: string;
}): { id?: string; error?: { status_code: number; body: string } } {
	const { method, origin, adminHost } = input;
	const url = new URL(input.url);
	const expected = adminHost ? `https://${adminHost}` : url.origin;
	if (
		(origin && origin !== expected) ||
		(!origin && !["HEAD", "GET", "OPTIONS"].includes(method))
	) {
		return { error: { status_code: 403, body: "Invalid request origin" } };
	}
	const match = /^\/uploads(?:\/([a-f0-9]{32}))?\/?$/.exec(url.pathname);
	if (!match || url.search)
		return { error: { status_code: 404, body: "Not found" } };
	if (method === "GET" || (method === "POST" && match[1]))
		return { error: { status_code: 405, body: "" } };
	return { id: match[1] };
}

function completionHeaders(receipt: Receipt) {
	return {
		"Tus-Resumable": "1.0.0",
		"Cache-Control": "no-store",
		"Upload-Offset": String(receipt.size),
		"Upload-Length": String(receipt.size),
		"Upload-Metadata": `filename ${Buffer.from(receipt.filename).toString("base64")}`,
	};
}

// Stateless I/O helpers. Callers own synchronization and operation ordering.
async function prepareUploadDirectories(
	config: Pick<typeof CONFIG, "datadir" | "tempdir">,
) {
	const publicRoot = await realpath(config.datadir);
	const tempRoot = path.resolve(config.tempdir || `${publicRoot}.tmp`);
	await mkdir(tempRoot, { recursive: true, mode: 0o700 });
	const resolved = await realpath(tempRoot);
	validateDirectoryLayout(publicRoot, resolved);
	const directory = path.join(resolved, "tus");
	const receipts = path.join(resolved, "tus-receipts");
	await mkdir(directory, { recursive: true, mode: 0o700 });
	await mkdir(receipts, { recursive: true, mode: 0o700 });
	return { publicRoot, directory, receipts };
}

async function statIfExists(filename: string) {
	try {
		return await lstat(filename);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		return undefined;
	}
}

async function validateUpload(upload: Upload, publicRoot: string) {
	const { filename, size } = parseUploadMetadata(upload);
	if (await statIfExists(path.join(publicRoot, filename)))
		throw { status_code: 409, body: "同名文件或目录已存在。" };
	logger.info({ uploadId: upload.id, filename, size }, "Upload created");
	return { filename };
}

async function readReceipt(
	receipts: string,
	publicRoot: string,
	id: string,
): Promise<Receipt | undefined> {
	const receiptPath = path.join(receipts, id);
	try {
		const stat = await statIfExists(receiptPath);
		if (!stat) return undefined;
		if (isExpired(stat.mtimeMs, Date.now()))
			throw { status_code: 410, body: "上传任务已过期。" };
		const receipt = parseReceipt(
			JSON.parse(await readFile(receiptPath, "utf8")),
		);
		// Old /complete receipts did not store the size; resolve it outside the parser.
		const size =
			receipt.size ??
			(await lstat(path.join(publicRoot, receipt.filename))).size;
		return { ...receipt, size };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}

async function copyUploadedFile(source: string, destination: string) {
	await chmod(source, 0o644);
	await copyFile(source, destination, constants.COPYFILE_EXCL);
}

async function writeReceipt(receiptPath: string, receipt: Receipt) {
	// Atomic replacement avoids exposing a partially written JSON record.
	await writeFile(`${receiptPath}.tmp`, JSON.stringify(receipt), {
		mode: 0o600,
	});
	await rename(`${receiptPath}.tmp`, receiptPath);
}

function onUploadResponseError(request: Request, error: unknown) {
	logger.warn(
		{ err: error, method: request.method, path: new URL(request.url).pathname },
		"Upload request failed",
	);
	return uploadError(error);
}

/** Owns one process's tus state. File publication shares the PATCH/DELETE lock. */
export class UploadService {
	private readonly store: FileStore;
	private readonly locker = new MemoryLocker();
	private readonly server: Server;
	// POST reads its upload again after the finish hook; defer removal until it returns.
	private readonly creating = new Map<Request, string>();
	private timer?: ReturnType<typeof setInterval>;
	private cleaning?: Promise<void>;

	private constructor(
		private readonly config: typeof CONFIG,
		private readonly publicRoot: string,
		private readonly directory: string,
		private readonly receipts: string,
	) {
		this.store = new FileStore({
			directory,
			expirationPeriodInMilliseconds: TTL,
		});
		this.server = new Server({
			path: "/uploads",
			relativeLocation: true,
			allowedOrigins: [],
			maxSize: config.maxUploadBytes,
			datastore: this.store,
			locker: this.locker,
			onUploadCreate: async (request, upload) => {
				const metadata = await validateUpload(upload, this.publicRoot);
				this.creating.set(request, upload.id);
				return { metadata };
			},
			onUploadFinish: async (request, upload) => {
				await this.finishUpload(upload.id, request.signal);
				return {};
			},
			onResponseError: onUploadResponseError,
		});
	}

	static async create(config = CONFIG) {
		const { publicRoot, directory, receipts } =
			await prepareUploadDirectories(config);
		return new UploadService(config, publicRoot, directory, receipts);
	}

	private async withLock<T>(
		id: string,
		signal: AbortSignal,
		run: () => Promise<T>,
	) {
		signal.throwIfAborted();
		const lock = this.locker.newLock(id);
		await lock.lock(signal, () => {});
		try {
			return await run();
		} finally {
			await lock.unlock();
		}
	}

	private async finishUpload(id: string, signal: AbortSignal) {
		return this.withLock(id, signal, async () => {
			const receipt = await readReceipt(this.receipts, this.publicRoot, id);
			if (receipt) return receipt;
			const upload = await this.store.getUpload(id);
			if (
				upload.creation_date &&
				isExpired(Date.parse(upload.creation_date), Date.now())
			)
				throw { status_code: 410, body: "上传任务已过期，请删除后重新上传。" };
			if (upload.size === undefined || upload.offset !== upload.size)
				return undefined;
			const { filename, size } = parseUploadMetadata(upload);
			await copyUploadedFile(
				path.join(this.directory, id),
				path.join(this.publicRoot, filename),
			);
			const completed: Receipt = { success: true, filename, size };
			await writeReceipt(path.join(this.receipts, id), completed);
			logger.info(
				{ uploadId: id, filename, size: upload.size },
				"Upload published",
			);
			return completed;
		});
	}

	private async recoverCompletion(
		request: Request,
		id: string,
		response: Response,
	) {
		// Keep tus header validation errors. A removed source can still have a receipt.
		if (![200, 404, 410].includes(response.status)) return response;
		const receipt = await this.finishUpload(id, request.signal);
		if (!receipt) return response;
		return new Response(null, {
			status: 200,
			headers: completionHeaders(receipt),
		});
	}

	private async removeCompleted(id: string) {
		await this.withLock(id, new AbortController().signal, async () => {
			if (
				[...this.creating.values()].includes(id) ||
				!(await readReceipt(this.receipts, this.publicRoot, id))
			)
				return;
			try {
				await this.store.remove(id);
			} catch (error) {
				if ((error as { status_code?: number }).status_code !== 404)
					throw error;
			}
		});
	}

	async handle(request: Request) {
		const { id: uploadId, error } = validateUploadRequest({
			method: request.method,
			url: request.url,
			origin: request.headers.get("origin"),
			adminHost: this.config.adminHost,
		});
		if (error) {
			if (error.status_code === 403)
				logger.warn({ method: request.method }, "Rejected upload origin");
			return new Response(error.body || null, { status: error.status_code });
		}
		try {
			const response = await this.server.handleWeb(request);
			if (request.method === "HEAD" && uploadId)
				return await this.recoverCompletion(request, uploadId, response);
			if (
				request.method === "DELETE" &&
				uploadId &&
				[204, 404, 410].includes(response.status)
			) {
				await rm(path.join(this.receipts, `${uploadId}.tmp`), { force: true });
				if (response.ok) logger.info({ uploadId }, "Upload terminated");
			}
			return response;
		} catch (error) {
			logger.warn({ err: error, uploadId }, "Unable to recover upload");
			const mapped = uploadError(error);
			return new Response(request.method === "HEAD" ? null : mapped.body, {
				status: mapped.status_code,
				headers: { "Tus-Resumable": "1.0.0", "Cache-Control": "no-store" },
			});
		} finally {
			const id = this.creating.get(request) || uploadId;
			this.creating.delete(request);
			if (id) {
				try {
					await this.removeCompleted(id);
				} catch (err) {
					logger.error(
						{ err, uploadId: id },
						"Unable to clean completed upload",
					);
				}
			}
		}
	}

	cleanup() {
		this.cleaning ??= this.cleanExpired().finally(() => {
			this.cleaning = undefined;
		});
		return this.cleaning;
	}

	private async cleanExpired() {
		const names = new Set([
			...(await readdir(this.directory)),
			...(await readdir(this.receipts)),
		]);
		for (const id of names) {
			if (
				!idPattern.test(id) ||
				this.locker.locks.has(id) ||
				[...this.creating.values()].includes(id)
			)
				continue;
			await this.withLock(id, new AbortController().signal, async () => {
				try {
					const receiptPath = path.join(this.receipts, id);
					const receiptStat = await statIfExists(receiptPath);
					if (receiptStat) {
						try {
							await this.store.remove(id);
						} catch (error) {
							if ((error as { status_code?: number }).status_code !== 404)
								throw error;
						}
						if (isExpired(receiptStat.mtimeMs, Date.now()))
							await rm(receiptPath);
					} else {
						const upload = await this.store.getUpload(id);
						if (
							!upload.creation_date ||
							!isExpired(Date.parse(upload.creation_date), Date.now())
						)
							return;
						await this.store.remove(id);
						logger.info({ uploadId: id }, "Expired upload removed");
					}
					await rm(`${receiptPath}.tmp`, { force: true });
				} catch (err) {
					logger.warn({ err, uploadId: id }, "Unable to clean upload");
				}
			});
		}
	}

	startCleanup() {
		if (this.timer) return;
		const clean = () => {
			void this.cleanup().catch((err) =>
				logger.error({ err }, "Upload cleanup failed"),
			);
		};
		clean();
		this.timer = setInterval(clean, 60 * 60 * 1000);
		this.timer.unref();
	}

	async dispose() {
		clearInterval(this.timer);
		this.timer = undefined;
		await this.cleaning;
	}
}

// Keep the factory for callers that supply isolated test/configuration directories.
export const createUploadService = (config = CONFIG) =>
	UploadService.create(config);
let service: Promise<UploadService> | undefined;
export async function handleTusRequest(request: Request) {
	service ??= UploadService.create()
		.then((instance) => {
			instance.startCleanup();
			return instance;
		})
		.catch((error) => {
			service = undefined;
			throw error;
		});
	return (await service).handle(request);
}
