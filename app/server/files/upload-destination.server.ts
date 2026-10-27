import path from "node:path";
import {
	INVALID_ROOT_MESSAGE,
	parseRelativePath,
	resolveEntry,
	SYMLINK_MESSAGE,
} from "./paths.server";

/** Omitted metadata from older uploads continues to target the root. */
export function parseUploadDirectory(value: unknown): string {
	const directory = value === undefined || value === null ? "" : value;
	try {
		if (typeof directory !== "string") throw new Error("Invalid directory");
		parseRelativePath(directory, { allowRoot: true });
		return directory;
	} catch {
		throw { status_code: 400, body: "Invalid upload directory." };
	}
}

/** Recheck the parent at creation and completion; never follow symbolic links. */
export async function resolveUploadDestination(
	root: string,
	directory: string,
	filename: string,
) {
	try {
		const { targetPath, targetStats } = await resolveEntry(root, directory, {
			allowRoot: true,
		});
		if (!targetStats.isDirectory()) throw new Error("Not a directory");
		return path.join(targetPath, filename);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		const expected =
			["ENOENT", "ENOTDIR"].includes(code || "") ||
			(error instanceof Error &&
				["Not a directory", SYMLINK_MESSAGE, INVALID_ROOT_MESSAGE].includes(
					error.message,
				));
		if (!expected) throw error;
		throw {
			status_code: 422,
			body: "Upload destination is unavailable. Select an existing folder.",
		};
	}
}
