import fs from "node:fs/promises";
import path from "node:path";
import type {
	FileActionContext,
	FileActionResult,
} from "./action-types.server";
import { CONFIG } from "./config.server";
import { fileOperationLevel, fileOperationMessage } from "./file-errors.server";
import { resolveFileEntry } from "./remove-action.server";
export async function handleRenameAction({
	form,
	requestLogger,
}: FileActionContext): Promise<FileActionResult> {
	if ([...form.values()].some((value) => typeof value !== "string")) {
		requestLogger.warn(
			{ operation: "rename" },
			"Rejected non-text rename form",
		);
		return { error: "操作表单无效，请刷新页面后重试。" };
	}

	const relativePath = form.get("path");
	if (typeof relativePath !== "string") {
		requestLogger.warn({ operation: "rename" }, "Invalid rename file path");
		return { error: "文件路径无效，请刷新列表后重试。" };
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
			"文件名无效，请输入有效的新名称。",
		);
		return { error: "文件名无效，请输入有效的新名称。" };
	}
	try {
		const { targetPath: absolutePath } = await resolveFileEntry(
			CONFIG.datadir,
			relativePath,
		);
		const newAbsolutePath = path.join(path.dirname(absolutePath), newName);
		await fs.rename(absolutePath, newAbsolutePath);
	} catch (error) {
		requestLogger[fileOperationLevel(error)](
			{ err: error, operation: "rename", relativePath, newName },
			"Unable to rename file entry",
		);
		return {
			error: fileOperationMessage(error, "重命名"),
		};
	}
	requestLogger.info(
		{ operation: "rename", relativePath, newName },
		"File entry renamed",
	);
	return { success: true };
}
