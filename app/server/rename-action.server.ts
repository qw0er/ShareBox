import fs from "node:fs/promises";
import path from "node:path";
import type {
	FileActionContext,
	FileActionResult,
} from "./action-types.server";
import { CONFIG } from "./config.server";
import { fileOperationLevel, fileOperationMessage } from "./file-errors.server";
import { resolveEntry } from "./files/paths.server";
import { isNotFoundError } from "./utils.server";
export async function handleRenameAction({
	form,
	requestLogger,
}: FileActionContext): Promise<FileActionResult> {
	if ([...form.values()].some((value) => typeof value !== "string")) {
		requestLogger.warn(
			{ operation: "rename" },
			"Rejected non-text rename form",
		);
		return { error: "Invalid form. Refresh the page and try again." };
	}

	const relativePath = form.get("path");
	if (typeof relativePath !== "string") {
		requestLogger.warn({ operation: "rename" }, "Invalid rename file path");
		return { error: "Invalid file path. Refresh the list and try again." };
	}
	const newName = form.get("newName");
	if (
		typeof newName !== "string" ||
		!newName ||
		newName === "." ||
		newName === ".." ||
		/[\\/\0]/.test(newName)
	) {
		requestLogger.warn(
			{ operation: "rename" },
			"Invalid filename. Enter a valid name.",
		);
		return { error: "Invalid filename. Enter a valid name." };
	}
	try {
		const { targetPath: absolutePath } = await resolveEntry(
			CONFIG.filesDir,
			relativePath,
		);
		const newAbsolutePath = path.join(path.dirname(absolutePath), newName);
		// fs.rename() replaces an existing target on POSIX; reject conflicts
		// explicitly so a rename cannot silently destroy another file.
		try {
			await fs.lstat(newAbsolutePath);
			throw Object.assign(new Error("Target already exists"), {
				code: "EEXIST",
			});
		} catch (error) {
			if (!isNotFoundError(error)) throw error;
		}
		await fs.rename(absolutePath, newAbsolutePath);
	} catch (error) {
		requestLogger[fileOperationLevel(error)](
			{ err: error, operation: "rename", relativePath, newName },
			"Unable to rename file entry",
		);
		return {
			error: fileOperationMessage(error, "rename"),
		};
	}
	requestLogger.info(
		{ operation: "rename", relativePath, newName },
		"File entry renamed",
	);
	return {
		success: true,
		change: {
			kind: "rename",
			fromPath: relativePath,
			toPath: path.posix.join(path.posix.dirname(relativePath), newName),
		},
	};
}
