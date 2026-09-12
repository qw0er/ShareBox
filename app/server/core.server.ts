import fs from "node:fs/promises";
import path from "node:path";

export type FileNode =
	| {
			name: string;
			path: string;
			type: "file";
			size: number;
	  }
	| {
			name: string;
			path: string;
			type: "directory";
			children: FileNode[];
	  };

function isNotFoundError(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}

export async function getFileTree(dirPath: string): Promise<FileNode[]> {
	const entries = await fs.readdir(dirPath, { withFileTypes: true });
	const nodes = await Promise.all(
		entries.map(async (entry): Promise<FileNode | null> => {
			const fullPath = path.join(dirPath, entry.name);

			try {
				const stats = await fs.lstat(fullPath);

				// Do not expose links or follow links outside the configured data tree.
				if (stats.isSymbolicLink()) {
					return null;
				}

				if (stats.isDirectory()) {
					return {
						name: entry.name,
						path: fullPath,
						type: "directory",
						children: await getFileTree(fullPath),
					};
				}

				if (stats.isFile()) {
					return {
						name: entry.name,
						path: fullPath,
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
