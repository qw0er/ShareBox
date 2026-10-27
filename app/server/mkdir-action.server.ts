import fs from "node:fs/promises";
import path from "node:path";
import type {
	FileActionContext,
	FileActionResult,
} from "./action-types.server";
import { CONFIG } from "./config.server";
import { fileOperationLevel, fileOperationMessage } from "./file-errors.server";
import { resolveEntry } from "./files/paths.server";

export async function handleMkdirAction({
	form,
	requestLogger,
}: FileActionContext): Promise<FileActionResult> {
	const parent = form.get("path");
	const name = form.get("name");
	if ([...form.values()].some((value) => typeof value !== "string")) {
		requestLogger.warn("Rejected non-text folder creation form");
		return { error: "Invalid form. Refresh the page and try again." };
	}
	if (typeof parent !== "string") {
		requestLogger.warn("Invalid folder creation path");
		return { error: "Invalid file path. Refresh the list and try again." };
	}
	if (
		typeof name !== "string" ||
		!name.trim() ||
		name === "." ||
		name === ".." ||
		/[\\/\0]/.test(name)
	) {
		requestLogger.warn("Invalid folder name");
		return { error: "Invalid filename. Enter a valid name." };
	}
	try {
		const { targetPath, targetStats } = await resolveEntry(
			CONFIG.filesDir,
			parent,
			{ allowRoot: true },
		);
		if (!targetStats.isDirectory())
			throw Object.assign(new Error("Parent is not a directory"), {
				code: "ENOTDIR",
			});
		// Non-recursive mkdir atomically rejects existing files, folders and links.
		await fs.mkdir(path.join(targetPath, name), { mode: 0o700 });
		requestLogger.info({ parent, name }, "Folder created");
		return { success: true };
	} catch (error) {
		requestLogger[fileOperationLevel(error)](
			{ err: error, parent, name },
			"Unable to create folder",
		);
		return { error: fileOperationMessage(error, "create folder") };
	}
}
