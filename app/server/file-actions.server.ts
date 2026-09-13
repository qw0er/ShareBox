import { writeFile } from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "./config.server";
import { removeFileEntry } from "./core.server";
import { logger } from "./logger.server";

export async function handleFileAction(request: Request) {
	const requestLogger = logger.child({
		component: "file-actions",
		method: request.method,
		path: new URL(request.url).pathname,
	});
	let formData: FormData;
	try {
		formData = await request.formData();
	} catch (error) {
		requestLogger.warn({ err: error }, "Invalid action form data");
		return { error: "Invalid form data" };
	}
	const intent = formData.get("intent");

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

	const file = formData.get("file");
	if (!(file instanceof File) || !file.name) {
		requestLogger.warn({ operation: "upload" }, "No file uploaded");
		return { error: "No file uploaded" };
	}
	if (file.name === "." || file.name === ".." || /[\\/\0]/.test(file.name)) {
		requestLogger.warn(
			{ operation: "upload", fileName: file.name },
			"Invalid file name",
		);
		return { error: "Invalid file name" };
	}
	try {
		const buffer = Buffer.from(await file.arrayBuffer());
		await writeFile(path.join(CONFIG.datadir, file.name), buffer);
		requestLogger.info(
			{ operation: "upload", fileName: file.name, fileSize: file.size },
			"File uploaded",
		);
		return { success: true };
	} catch (error) {
		requestLogger.error(
			{
				err: error,
				operation: "upload",
				fileName: file.name,
				fileSize: file.size,
			},
			"Unable to upload file",
		);
		return { error: "上传失败，请检查存储空间和目录权限后重试。" };
	}
}
