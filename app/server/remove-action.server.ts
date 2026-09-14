import type {
	FileActionContext,
	FileActionResult,
} from "./action-types.server";
import { CONFIG } from "./config.server";
import { removeFileEntry } from "./core.server";

export async function handleRemoveAction({
	form,
	requestLogger,
}: FileActionContext): Promise<FileActionResult> {
	if (form.filename) return { error: "Invalid form data" };

	const relativePath = form.fields.get("path");
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
		const code = getErrorCode(error);
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
			requestLogger.error(logContext, "Permission denied while removing entry");
			return { error: "Permission denied" };
		}
		requestLogger.error(logContext, "Unable to remove file entry");
		return {
			error: error instanceof Error ? error.message : "Unable to remove entry",
		};
	}
}

function getErrorCode(error: unknown): NodeJS.ErrnoException["code"] {
	return error instanceof Error && "code" in error
		? (error as NodeJS.ErrnoException).code
		: undefined;
}
