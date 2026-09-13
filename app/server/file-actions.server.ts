import { CONFIG } from "./config.server";
import { removeFileEntry } from "./core.server";
import { logger } from "./logger.server";
import { parseFileForm } from "./upload.server";

export async function handleFileAction(request: Request) {
	const requestLogger = logger.child({
		component: "file-actions",
		method: request.method,
		path: new URL(request.url).pathname,
	});
	if (request.method !== "POST") {
		requestLogger.warn("Rejected non-POST action");
		return { error: "Method not allowed" };
	}
	const expectedOrigin = CONFIG.adminHost
		? `https://${CONFIG.adminHost}`
		: new URL(request.url).origin;
	if (request.headers.get("origin") !== expectedOrigin) {
		requestLogger.warn("Rejected action origin");
		return { error: "Invalid request origin" };
	}
	let form: Awaited<ReturnType<typeof parseFileForm>>;
	try {
		form = await parseFileForm(request);
	} catch (error) {
		requestLogger.warn({ err: error }, "Unable to parse file form");
		return {
			error: error instanceof Error ? error.message : "Invalid form data",
		};
	}
	const formData = form.fields;
	const intent = formData.get("intent");
	try {
		if (intent === "remove" && form.filename)
			return { error: "Invalid form data" };

		if (intent === "remove") {
			const relativePath = formData.get("path");
			if (typeof relativePath !== "string") {
				requestLogger.warn({ operation: "remove" }, "Invalid file path");
				return { error: "Invalid file path" };
			}

			try {
				await removeFileEntry(CONFIG.datadir, relativePath);
				requestLogger.info(
					{ operation: "remove", relativePath },
					"File entry removed",
				);
				return { success: true };
			} catch (error) {
				const code =
					error instanceof Error && "code" in error
						? (error as NodeJS.ErrnoException).code
						: undefined;
				const logContext = {
					err: error,
					operation: "remove",
					relativePath,
					code,
				};

				if (code === "ENOENT") {
					requestLogger.warn(logContext, "File entry no longer exists");
					return { error: "File or directory no longer exists" };
				}
				if (code === "ENOTEMPTY" || code === "EEXIST") {
					requestLogger.warn(logContext, "Directory is not empty");
					return { error: "Directory is not empty" };
				}
				if (code === "EACCES" || code === "EPERM") {
					requestLogger.error(
						logContext,
						"Permission denied while removing entry",
					);
					return { error: "Permission denied" };
				}
				requestLogger.error(logContext, "Unable to remove file entry");
				return {
					error:
						error instanceof Error ? error.message : "Unable to remove entry",
				};
			}
		}

		if (intent !== "upload") {
			requestLogger.warn(
				{ intent: typeof intent === "string" ? intent : null },
				"Invalid file action",
			);
			return { error: "Invalid action" };
		}

		if (!form.filename) return { error: "No file uploaded" };
		if (formData.has("path")) return { error: "Invalid form data" };
		try {
			await form.publish();
			requestLogger.info(
				{ operation: "upload", fileName: form.filename, fileSize: form.size },
				"File uploaded",
			);
			return { success: true };
		} catch (error) {
			requestLogger.warn(
				{ err: error, operation: "upload", fileName: form.filename },
				"Unable to publish upload",
			);
			if (
				error &&
				typeof error === "object" &&
				"code" in error &&
				error.code === "EEXIST"
			) {
				return { error: "同名文件或目录已存在，未覆盖原有内容。" };
			}
			return { error: "上传失败，请检查存储空间和目录权限后重试。" };
		}
	} finally {
		await form.cleanup();
	}
}
