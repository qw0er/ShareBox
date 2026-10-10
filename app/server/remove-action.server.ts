import fs from "node:fs/promises";
import path from "node:path";
import type {
	FileActionContext,
	FileActionResult,
} from "./action-types.server";
import { CONFIG } from "./config.server";
import { fileOperationLevel, fileOperationMessage } from "./file-errors.server";
import { checkRootDirectory } from "./utils.server";

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
		await removeFileEntry(CONFIG.datadir, relativePath);
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
	const { targetPath, targetStats } = await resolveFileEntry(
		rootDir,
		relativePath,
	);

	if (targetStats?.isFile()) {
		await fs.unlink(targetPath);
		return;
	}

	if (targetStats?.isDirectory()) {
		await fs.rmdir(targetPath);
		return;
	}

	throw new Error("Unsupported file type");
}

export async function resolveFileEntry(rootDir: string, relativePath: string) {
	if (
		!relativePath ||
		path.isAbsolute(relativePath) ||
		path.win32.isAbsolute(relativePath)
	) {
		throw new Error("Invalid file path");
	}

	const segments = relativePath.split(/[\\/]/);
	if (
		segments.some(
			(segment) =>
				!segment ||
				segment === "." ||
				segment === ".." ||
				segment.includes("\0"),
		)
	) {
		throw new Error("Invalid file path");
	}

	let targetPath = path.resolve(rootDir);
	await checkRootDirectory(targetPath);
	let targetStats: Awaited<ReturnType<typeof fs.lstat>> | undefined;

	for (const segment of segments) {
		targetPath = path.join(targetPath, segment);
		targetStats = await fs.lstat(targetPath);
		if (targetStats.isSymbolicLink()) {
			throw new Error("Symbolic links are not supported");
		}
	}

	return { targetPath, targetStats };
}
