import fs from "node:fs/promises";
import type {
	FileActionContext,
	FileActionResult,
} from "./action-types.server";
import { CONFIG } from "./config.server";
import { fileOperationLevel, fileOperationMessage } from "./file-errors.server";
import { resolveEntry } from "./files/paths.server";

export async function handleRemoveAction({
	form,
	requestLogger,
}: FileActionContext): Promise<FileActionResult> {
	if ([...form.values()].some((value) => typeof value !== "string")) {
		requestLogger.warn(
			{ operation: "remove" },
			"Rejected non-text removal form",
		);
		return { error: "操作表单无效，请刷新页面后重试。" };
	}

	const relativePath = form.get("path");
	if (typeof relativePath !== "string") {
		requestLogger.warn({ operation: "remove" }, "Invalid file path");
		return { error: "文件路径无效，请刷新列表后重试。" };
	}

	try {
		await removeFileEntry(CONFIG.filesDir, relativePath);
		requestLogger.info(
			{ operation: "remove", relativePath },
			"File entry removed",
		);
		return { success: true };
	} catch (error) {
		requestLogger[fileOperationLevel(error)](
			{ err: error, operation: "remove", relativePath },
			"Unable to remove file entry",
		);
		return { error: fileOperationMessage(error, "删除") };
	}
}

export async function removeFileEntry(
	rootDir: string,
	relativePath: string,
): Promise<void> {
	const { targetPath, targetStats } = await resolveEntry(rootDir, relativePath);

	if (targetStats.isFile()) {
		await fs.unlink(targetPath);
		return;
	}

	if (targetStats.isDirectory()) {
		await fs.rmdir(targetPath);
		return;
	}

	throw new Error("Unsupported file type");
}
