import fs from "node:fs/promises";
import path from "node:path";

import type { FileNode } from "~/types/files";

function isNotFoundError(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}

export async function getFileTree(dirPath: string): Promise<FileNode[]> {
	const rootPath = path.resolve(dirPath);
	return readFileTree(rootPath, rootPath);
}

async function readFileTree(
	rootPath: string,
	dirPath: string,
): Promise<FileNode[]> {
	const entries = await fs.readdir(dirPath, { withFileTypes: true });
	const nodes = await Promise.all(
		entries.map(async (entry): Promise<FileNode | null> => {
			const fullPath = path.join(dirPath, entry.name);
			const relativePath = path
				.relative(rootPath, fullPath)
				.split(path.sep)
				.join("/");

			try {
				const stats = await fs.lstat(fullPath);

				// Do not expose links or follow links outside the configured data tree.
				if (stats.isSymbolicLink()) {
					return null;
				}

				if (stats.isDirectory()) {
					return {
						name: entry.name,
						path: relativePath,
						type: "directory",
						children: await readFileTree(rootPath, fullPath),
					};
				}

				if (stats.isFile()) {
					return {
						name: entry.name,
						path: relativePath,
						type: "file",
						size: stats.size,
					};
				}

				return null;
			} catch (error) {
				// A file may be removed after readdir() while the tree is being built.
				if (isNotFoundError(error)) {
					return null;
				}
				throw error;
			}
		}),
	);

	return nodes
		.filter((node): node is FileNode => node !== null)
		.sort((left, right) => {
			if (left.type !== right.type) {
				return left.type === "directory" ? -1 : 1;
			}
			return left.name.localeCompare(right.name);
		});
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
