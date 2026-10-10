import FileBrowser from "~/components/files/FileBrowser";
import WorkspaceLayout from "~/components/layout/WorkspaceLayout";
import UploadPanel from "~/components/upload/UploadPanel";
import { getAuth } from "~/server/auth.server";
import { CONFIG } from "~/server/config.server";
import { handleFileAction } from "~/server/file-actions.server";
import { logger } from "~/server/logger.server";
import { getFileTree } from "~/server/read-files.server";
import type { Route } from "./+types/home";

export function meta() {
	return [
		{ title: "ShareBox" },
		{ name: "description", content: "ShareBox 文件管理工作区" },
	];
}
export async function loader({ request }: Route.LoaderArgs) {
	await getAuth().requireAdmin(request, true);
	const startedAt = Date.now();
	try {
		const fileTree = await getFileTree(CONFIG.datadir);
		logger.info(
			{
				component: "file-browser",
				rootEntries: fileTree.length,
				durationMs: Date.now() - startedAt,
			},
			"File tree loaded",
		);
		return {
			fileTree,
			maxUploadBytes: CONFIG.maxUploadBytes,
		};
	} catch (error) {
		logger.error(
			{
				err: error,
				component: "file-browser",
				durationMs: Date.now() - startedAt,
			},
			"Unable to load file tree",
		);
		throw error;
	}
}
export async function action({ request }: Route.ActionArgs) {
	await getAuth().requireAdmin(request);
	return handleFileAction(request);
}

export default function Home({ loaderData }: Route.ComponentProps) {
	return (
		<WorkspaceLayout>
			<FileBrowser fileTree={loaderData.fileTree} />
			<UploadPanel maxUploadBytes={loaderData.maxUploadBytes} />
		</WorkspaceLayout>
	);
}

export function headers() {
	return { "Cache-Control": "no-store" };
}
