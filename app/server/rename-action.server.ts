import fs from "node:fs/promises";
import path from "node:path";
import type {
	FileActionContext,
	FileActionResult,
} from "./action-types.server";
import { CONFIG } from "./config.server";
export async function handleRenameAction({
	form,
	requestLogger,
}: FileActionContext): Promise<FileActionResult> {
	if ([...form.values()].some((value) => typeof value !== "string"))
		return { error: "Invalid form data" };

	const relativePath = form.get("path");
	if (typeof relativePath !== "string") {
		requestLogger.warn({ operation: "remove" }, "Invalid file path");
		return { error: "Invalid file path" };
	}
	const absolutePath = path.join(CONFIG.datadir, relativePath);
	const newName = form.get("newName");
	if (typeof newName !== "string") {
		requestLogger.warn({ operation: "rename" }, "Invalid new file name");
		return { error: "Invalid new file name" };
	}
	const newAbsolutePath = path.join(path.dirname(absolutePath), newName);
	try {
		await fs.rename(absolutePath, newAbsolutePath);
	} catch (error) {
		requestLogger.error(
			{ err: error, operation: "rename", relativePath, newName },
			"Unable to rename file entry",
		);
		return {
			error: error instanceof Error ? error.message : "Unable to rename entry",
		};
	}
	return { success: true };
}
