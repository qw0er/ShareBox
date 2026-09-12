import { writeFile } from "node:fs/promises";
import path from "node:path";
import MainPage from "~/MainPage";
import { CONFIG } from "~/server/config.server";
import { getFileTree } from "~/server/core.server";
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
	return <MainPage actionData={actionData} fileTree={loaderData?.fileTree} />;
}
