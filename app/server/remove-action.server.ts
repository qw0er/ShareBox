import fs from "node:fs/promises";
import path from "node:path";
import type {
	FileActionContext,
	FileActionResult,
} from "./action-types.server";
import { CONFIG } from "./config.server";
import { checkRootDirectory } from "./utils.server";

export async function handleRemoveAction({
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

export async function removeFileEntry(
	rootDir: string,
	relativePath: string,
): Promise<void> {
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
