import { writeFile } from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "./config.server";
import { removeFileEntry } from "./core.server";

export async function handleFileAction(request: Request) {
	const formData = await request.formData();
	const intent = formData.get("intent");

	if (intent === "remove") {
		const relativePath = formData.get("path");
		if (typeof relativePath !== "string") {
			return { error: "Invalid file path" };
		}

		try {
			await removeFileEntry(CONFIG.datadir, relativePath);
			return { success: true };
		} catch (error) {
			const code =
				error instanceof Error && "code" in error
					? (error as NodeJS.ErrnoException).code
					: undefined;

			if (code === "ENOENT") {
				return { error: "File or directory no longer exists" };
			}
			if (code === "ENOTEMPTY" || code === "EEXIST") {
				return { error: "Directory is not empty" };
			}
			if (code === "EACCES" || code === "EPERM") {
				return { error: "Permission denied" };
			}
			return {
				error:
					error instanceof Error ? error.message : "Unable to remove entry",
			};
		}
	}

	if (intent !== "upload") {
		return { error: "Invalid action" };
	}

	const file = formData.get("file");
	if (!(file instanceof File) || !file.name) {
		return { error: "No file uploaded" };
	}
	if (file.name === "." || file.name === ".." || /[\\/\0]/.test(file.name)) {
		return { error: "Invalid file name" };
	}
	try {
		const buffer = Buffer.from(await file.arrayBuffer());
		await writeFile(path.join(CONFIG.datadir, file.name), buffer);
		return { success: true };
	} catch {
		return { error: "上传失败，请检查存储空间和目录权限后重试。" };
	}
}
