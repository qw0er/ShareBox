import { writeFile } from "node:fs/promises";
import path from "node:path";
import { Typography } from "@mui/material";
import FileTree from "~/components/FileTree";
import UploadCom from "~/components/UploadCom";
import { CONFIG } from "~/server/config.server";
import { getFileTree, removeFileEntry } from "~/server/core.server";
import type { Route } from "./+types/home";
export function meta() {
	return [
		{ title: "ShareBox" },
		{ name: "description", content: "Welcome to ShareBox!" },
	];
}
export async function loader() {
	return { fileTree: await getFileTree(CONFIG.datadir) };
}
export async function action({ request }: Route.ActionArgs) {
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
	const buffer = Buffer.from(await file.arrayBuffer());
	await writeFile(path.join(CONFIG.datadir, file.name), buffer);
	return { success: true };
}

export default function Home({ actionData, loaderData }: Route.ComponentProps) {
	return (
		<>
			<Typography variant="h1">ShareBox</Typography>
			<UploadCom />
			{actionData?.success && (
				<Typography color="primary">File uploaded successfully!</Typography>
			)}
			{actionData?.error && (
				<Typography color="error">{actionData.error}</Typography>
			)}
			<FileTree fileTree={loaderData.fileTree} />
		</>
	);
}
