import { constants } from "node:fs";
import {
	chmod,
	copyFile,
	lstat,
	mkdir,
	readdir,
	readFile,
	realpath,
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

function validateFileName(name: string) {
	if (!name || name === "." || name === ".." || /[\\/\0]/.test(name)) {
		throw new Error("Invalid file name");
	}
}

/** One process owns the upload directory. Locks are shared with tus PATCH/DELETE. */
export async function createUploadService(config = CONFIG) {
	const publicRoot = await realpath(config.datadir);
	const tempRoot = path.resolve(config.tempdir || `${publicRoot}.tmp`);
	await mkdir(tempRoot, { recursive: true, mode: 0o700 });
	const resolved = await realpath(tempRoot);
	if (
		resolved === publicRoot ||
		resolved.startsWith(`${publicRoot}${path.sep}`) ||
		publicRoot.startsWith(`${resolved}${path.sep}`)
	) {
		throw new Error("Temporary directory must be separate from data directory");
	}
	const directory = path.join(resolved, "tus");
	const receipts = path.join(resolved, "tus-receipts");
	await mkdir(directory, { recursive: true, mode: 0o700 });
	await mkdir(receipts, { recursive: true, mode: 0o700 });
	const store = new FileStore({
		directory,
		expirationPeriodInMilliseconds: TTL,
	});
	const locker = new MemoryLocker();
	const server = new Server({
		path: "/uploads",
		relativeLocation: true,
		allowedOrigins: [],
		maxSize: config.maxUploadBytes,
		datastore: store,
		locker,
		async onUploadCreate(_request, upload) {
			try {
				validateFileName(upload.metadata?.filename || "");
			} catch {
				throw { status_code: 400, body: "Invalid file name" };
			}
			if (upload.size === undefined)
				throw { status_code: 400, body: "Upload-Length is required" };
			const filename = upload.metadata!.filename!;
			try {
				await lstat(path.join(publicRoot, filename));
				throw { status_code: 409, body: "同名文件或目录已存在。" };
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
			logger.info(
				{ uploadId: upload.id, filename, size: upload.size },
				"Upload created",
			);
			return { metadata: { filename } };
		},
		onResponseError(request, error) {
			logger.warn(
				{
					err: error,
					method: request.method,
					path: new URL(request.url).pathname,
				},
				"Upload request failed",
			);
			return undefined;
		},
	});

	async function complete(id: string, request: Request) {
		const lock = locker.newLock(id);
		await lock.lock(request.signal, () => {});
		try {
			const receiptPath = path.join(receipts, id);
			try {
				const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
				return Response.json(receipt);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
			const upload = await store.getUpload(id);
			if (
				upload.creation_date &&
				Date.now() - Date.parse(upload.creation_date) > TTL
			)
				return Response.json(
					{ error: "上传任务已过期，请删除后重新上传。" },
					{ status: 410 },
				);
			if (upload.size === undefined || upload.offset !== upload.size)
				return Response.json({ error: "文件尚未传输完成。" }, { status: 409 });
			const filename = upload.metadata?.filename || "";
			validateFileName(filename);
			await chmod(path.join(directory, id), 0o644);
			await copyFile(
				path.join(directory, id),
				path.join(publicRoot, filename),
				constants.COPYFILE_EXCL,
			);
			const receipt = { success: true, filename };
			// Keep a small receipt so a lost completion response can be retried safely.
			await writeFile(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
			try {
				await store.remove(id);
			} catch (error) {
				logger.error(
					{ err: error, uploadId: id },
					"Unable to clean completed upload",
				);
			}
			logger.info(
				{ uploadId: id, filename, size: upload.size },
				"Upload published",
			);
			return Response.json(receipt);
		} finally {
			await lock.unlock();
		}
	}

	async function handle(request: Request) {
		const url = new URL(request.url);
		const expected = config.adminHost
			? `https://${config.adminHost}`
			: url.origin;
		const origin = request.headers.get("origin");
		if (
			(origin && origin !== expected) ||
			(!origin && !["HEAD", "GET", "OPTIONS"].includes(request.method))
		) {
			logger.warn({ method: request.method }, "Rejected upload origin");
			return new Response("Invalid request origin", { status: 403 });
		}
		const match = /^\/uploads(?:\/([a-f0-9]{32})(\/complete)?)?\/?$/.exec(
			url.pathname,
		);
		if (!match) return new Response("Not found", { status: 404 });
		try {
			if (match[2]) {
				if (request.method !== "POST")
					return new Response(null, { status: 405 });
				return await complete(match[1], request);
			}
			if (request.method === "GET") return new Response(null, { status: 405 });
			if (request.method === "POST" && match[1])
				return new Response(null, { status: 405 });
			const response = await server.handleWeb(request);
			if (request.method === "DELETE" && response.ok)
				logger.info({ uploadId: match[1] }, "Upload terminated");
			return response;
		} catch (error) {
			logger.warn(
				{ err: error, uploadId: match[1] },
				"Unable to complete upload",
			);
			const code = (error as NodeJS.ErrnoException).code;
			const status =
				code === "EEXIST"
					? 409
					: (error as { status_code?: number }).status_code || 500;
			return Response.json(
				{
					error:
						code === "EEXIST"
							? "同名文件或目录已存在，未覆盖。"
							: "发布失败，请检查磁盘空间和权限后重试。",
				},
				{ status },
			);
		}
	}

	async function cleanup() {
		// Skip active requests; never use FileStore.deleteExpired without the shared lock.
		for (const name of await readdir(directory)) {
			if (!idPattern.test(name) || locker.locks.has(name)) continue;
			const lock = locker.newLock(name);
			await lock.lock(new AbortController().signal, () => {});
			try {
				const upload = await store.getUpload(name);
				if (
					upload.creation_date &&
					Date.now() - Date.parse(upload.creation_date) > TTL
				) {
					await store.remove(name);
					logger.info({ uploadId: name }, "Expired upload removed");
				}
			} catch (error) {
				logger.warn(
					{ err: error, uploadId: name },
					"Unable to clean expired upload",
				);
			} finally {
				await lock.unlock();
			}
		}
		for (const name of await readdir(receipts)) {
			if (
				idPattern.test(name) &&
				Date.now() - (await lstat(path.join(receipts, name))).mtimeMs > TTL
			)
				await rm(path.join(receipts, name));
		}
	}
	return { handle, cleanup };
}

async function initializeUploadService() {
	const instance = await createUploadService();

	const clean = async () => {
		try {
			await instance.cleanup();
		} catch (err) {
			logger.error({ err }, "Upload cleanup failed");
		}
	};

	void clean();
	setInterval(clean, 60 * 60 * 1000).unref();

	return instance;
}
let service: ReturnType<typeof createUploadService> | undefined;
export async function handleTusRequest(request: Request) {
	if (!service) {
		try {
			service = initializeUploadService();
		} catch (error) {
			service = undefined;
			throw error;
		}
	}
	return (await service).handle(request);
}
