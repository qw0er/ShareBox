import fs from "node:fs/promises";
export function isNotFoundError(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}

export async function checkRootDirectory(rootPath: string) {
	const stats = await fs.lstat(rootPath);
	if (!stats.isDirectory() || stats.isSymbolicLink())
		throw new Error("Invalid data directory");
}
