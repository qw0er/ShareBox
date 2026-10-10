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
import { logger, withoutRequestLogging } from "./logger.server";

const uploadLogger = logger.child({ component: "uploads" });

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
		throw {
			status_code: 400,
			body: "文件名无效，请避免使用斜杠、反斜杠或空名称。",
		};
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
			err.code === "EEXIST" || err.status_code === 409
				? "上传发生冲突，请检查同名文件或稍后重试。"
				: err.code === "ENOSPC"
					? "服务器存储空间不足，请联系管理员清理空间后重试。"
					: err.code === "EACCES" || err.code === "EPERM"
						? "服务器无法写入文件，请联系管理员检查存储目录权限。"
						: typeof err.status_code === "number" && err.status_code < 500
							? uploadStatusMessage(err.status_code)
							: "服务器暂时无法完成上传，请稍后重试；若仍失败，请联系管理员查看日志。",
	};
}

function uploadStatusMessage(status: number) {
	const messages: Record<number, string> = {
		400: "上传信息无效，请检查文件名并重新选择文件。",
		403: "上传请求被拒绝，请从本站页面重新操作。",
		404: "上传任务不存在，请重新选择文件后上传。",
		405: "不支持此上传请求方式，请刷新页面后重试。",
		410: "上传任务已过期，请移除任务后重新选择文件。",
		412: "上传协议不匹配，请刷新页面后重试。",
		413: "文件超过服务器大小限制，请选择较小的文件。",
		415: "上传数据格式无效，请刷新页面后重试。",
		423: "上传任务正在被处理，请稍后重试。",
		429: "上传请求过于频繁，请稍后重试。",
	};
	return messages[status] ?? "上传请求无效，请刷新页面后重试。";
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
		throw { status_code: 400, body: "缺少文件大小，请重新选择文件后上传。" };
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
		return {
			error: { status_code: 403, body: "请求来源无效，请从本站页面重新上传。" },
		};
	}
	const match = /^\/uploads(?:\/([a-f0-9]{32}))?\/?$/.exec(url.pathname);
	if (!match || url.search)
		return {
			error: {
				status_code: 404,
				body: "上传任务不存在，请重新选择文件后上传。",
			},
		};
	if (method === "GET" || (method === "POST" && match[1]))
		return {
			error: {
				status_code: 405,
				body: "不支持此上传请求方式，请刷新页面后重试。",
			},
		};
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
	const tempRoot = path.resolve(config.tempdir);
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
	uploadLogger.info(
		{ uploadId: upload.id, filename, size },
		"Upload creation accepted",
	);
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
	const mapped = uploadError(error);
	uploadLogger[
		request.signal.aborted
			? "debug"
			: mapped.status_code >= 500
				? "error"
				: "warn"
	](
		{
			status: mapped.status_code,
			err: error,
			method: request.method,
			path: new URL(request.url).pathname,
		},
		"Upload request failed",
	);
	return mapped;
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
		uploadLogger.info(
			{
				publicRoot,
				directory,
				receipts,
				maxUploadBytes: config.maxUploadBytes,
				expirationMs: TTL,
			},
			"Upload service initialized",
		);
		return new UploadService(config, publicRoot, directory, receipts);
	}

	private async withLock<T>(
		id: string,
		signal: AbortSignal,
		run: () => Promise<T>,
	) {
		signal.throwIfAborted();
		const startedAt = performance.now();
		uploadLogger.trace({ uploadId: id }, "Waiting for upload lock");
		const lock = this.locker.newLock(id);
		await lock.lock(signal, () => {});
		uploadLogger.trace(
			{ uploadId: id, durationMs: Math.round(performance.now() - startedAt) },
			"Upload lock acquired",
		);
		try {
			return await run();
		} finally {
			await lock.unlock();
		}
	}

	private async finishUpload(id: string, signal: AbortSignal) {
		return this.withLock(id, signal, async () => {
			const receipt = await readReceipt(this.receipts, this.publicRoot, id);
			if (receipt) {
				uploadLogger.debug(
					{ uploadId: id },
					"Upload completion receipt reused",
				);
				return receipt;
			}
			const upload = await this.store.getUpload(id);
			if (
				upload.creation_date &&
				isExpired(Date.parse(upload.creation_date), Date.now())
			)
				throw { status_code: 410, body: "上传任务已过期，请删除后重新上传。" };
			if (upload.size === undefined || upload.offset !== upload.size) {
				uploadLogger.debug(
					{ uploadId: id, offset: upload.offset, size: upload.size },
					"Upload is incomplete",
				);
				return undefined;
			}
			const { filename, size } = parseUploadMetadata(upload);
			const startedAt = performance.now();
			uploadLogger.debug(
				{ uploadId: id, filename, size },
				"Publishing uploaded file",
			);
			await copyUploadedFile(
				path.join(this.directory, id),
				path.join(this.publicRoot, filename),
			);
			const completed: Receipt = { success: true, filename, size };
			await writeReceipt(path.join(this.receipts, id), completed);
			uploadLogger.info(
				{
					uploadId: id,
					filename,
					size: upload.size,
					durationMs: Math.round(performance.now() - startedAt),
				},
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
			uploadLogger.warn(
				{ method: request.method, status: error.status_code, uploadId },
				"Rejected upload request",
			);
			return new Response(error.body || null, { status: error.status_code });
		}
		try {
			const response = await this.server.handleWeb(request);
			uploadLogger.debug(
				{
					uploadId: uploadId ?? this.creating.get(request),
					method: request.method,
					status: response.status,
					offset: response.headers.get("Upload-Offset"),
				},
				"Upload protocol response prepared",
			);
			if (request.method === "HEAD" && uploadId)
				return await this.recoverCompletion(request, uploadId, response);
			if (
				request.method === "DELETE" &&
				uploadId &&
				[204, 404, 410].includes(response.status)
			) {
				await rm(path.join(this.receipts, `${uploadId}.tmp`), { force: true });
				if (response.ok) uploadLogger.info({ uploadId }, "Upload terminated");
			}
			return response;
		} catch (error) {
			const mapped = uploadError(error);
			uploadLogger[
				request.signal.aborted
					? "debug"
					: mapped.status_code >= 500
						? "error"
						: "warn"
			](
				{ err: error, uploadId, status: mapped.status_code },
				"Upload processing failed",
			);
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
					uploadLogger.error(
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
		const startedAt = performance.now();
		uploadLogger.debug("Upload cleanup started");
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
						if (isExpired(receiptStat.mtimeMs, Date.now())) {
							await rm(receiptPath);
							uploadLogger.info(
								{ uploadId: id },
								"Expired completion receipt removed",
							);
						}
					} else {
						const upload = await this.store.getUpload(id);
						if (
							!upload.creation_date ||
							!isExpired(Date.parse(upload.creation_date), Date.now())
						)
							return;
						await this.store.remove(id);
						uploadLogger.info({ uploadId: id }, "Expired upload removed");
					}
					await rm(`${receiptPath}.tmp`, { force: true });
				} catch (err) {
					uploadLogger.error({ err, uploadId: id }, "Unable to clean upload");
				}
			});
		}
		uploadLogger.debug(
			{
				scannedEntries: names.size,
				durationMs: Math.round(performance.now() - startedAt),
			},
			"Upload cleanup finished",
		);
	}

	startCleanup() {
		if (this.timer) return;
		const clean = () => {
			void this.cleanup().catch((err) =>
				uploadLogger.error({ err }, "Upload cleanup failed"),
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
		uploadLogger.debug("Upload service disposed");
	}
}

// Keep the factory for callers that supply isolated test/configuration directories.
export const createUploadService = (config = CONFIG) =>
	UploadService.create(config);
let service: Promise<UploadService> | undefined;
export async function handleTusRequest(request: Request) {
	service ??= UploadService.create()
		.then((instance) => {
			withoutRequestLogging(() => instance.startCleanup());
			return instance;
		})
		.catch((error) => {
			service = undefined;
			uploadLogger.error(
				{ err: error },
				"Upload service initialization failed",
			);
			throw error;
		});
	return (await service).handle(request);
}
