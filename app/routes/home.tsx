import { writeFile } from "node:fs/promises";
import path from "node:path";
import MainPage from "~/MainPage";
import { CONFIG } from "~/server/config.server";
import type { Route } from "./+types/home";
export function meta() {
	return [
		{ title: "New React Router App" },
		{ name: "description", content: "Welcome to React Router!" },
	];
}

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData();
	const file = formData.get("file") as File;
	if (!file) {
		return { error: "No file uploaded" };
	}
	const buffer = Buffer.from(await file.arrayBuffer());
	await writeFile(path.join(CONFIG.datadir, file.name), buffer);
	return { success: true };
}

export default function Home() {
	return <MainPage />;
}
