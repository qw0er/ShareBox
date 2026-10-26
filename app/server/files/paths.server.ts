import type { Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export const INVALID_PATH_MESSAGE = "Invalid file path";
export const SYMLINK_MESSAGE = "Symbolic links are not supported";
export const INVALID_ROOT_MESSAGE = "Invalid data directory";

export type ResolvedEntry = {
	targetPath: string;
	targetStats: Stats;
};

export async function checkRootDirectory(rootPath: string): Promise<void> {
	const stats = await fs.lstat(rootPath);
	if (!stats.isDirectory() || stats.isSymbolicLink())
		throw new Error(INVALID_ROOT_MESSAGE);
}

/**
 * Split a user supplied POSIX relative path into safe segments.
 *
 * Backslashes are rejected instead of treated as separators so POSIX and
 * Windows-style input cannot resolve to different files.
 */
export function parseRelativePath(
	relativePath: string,
	options: { allowRoot?: boolean } = {},
): string[] {
	if (!relativePath) {
		if (options.allowRoot) return [];
		throw new Error(INVALID_PATH_MESSAGE);
	}
	if (
		path.isAbsolute(relativePath) ||
		path.win32.isAbsolute(relativePath) ||
		relativePath.includes("\\")
	) {
		throw new Error(INVALID_PATH_MESSAGE);
	}
	const segments = relativePath.split("/");
	if (
		segments.some(
			(segment) =>
				!segment ||
				segment === "." ||
				segment === ".." ||
				segment.includes("\0"),
		)
	) {
		throw new Error(INVALID_PATH_MESSAGE);
	}
	return segments;
}

/**
 * Resolve a relative path below a root without following symbolic links.
 *
 * Callers still need to check the returned entry type and handle the small
 * validation/open race documented in the architecture notes.
 */
export async function resolveEntry(
	rootDir: string,
	relativePath: string,
	options: { allowRoot?: boolean } = {},
): Promise<ResolvedEntry> {
	const segments = parseRelativePath(relativePath, options);
	let targetPath = path.resolve(rootDir);
	await checkRootDirectory(targetPath);

	if (segments.length === 0) {
		return { targetPath, targetStats: await fs.lstat(targetPath) };
	}

	let targetStats: Stats | undefined;
	for (const segment of segments) {
		targetPath = path.join(targetPath, segment);
		targetStats = await fs.lstat(targetPath);
		if (targetStats.isSymbolicLink()) throw new Error(SYMLINK_MESSAGE);
	}
	if (!targetStats) throw new Error(INVALID_PATH_MESSAGE);
	return { targetPath, targetStats };
}
