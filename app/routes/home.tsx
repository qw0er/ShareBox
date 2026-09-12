import FileBrowser from "~/components/files/FileBrowser";
import WorkspaceLayout from "~/components/layout/WorkspaceLayout";
import UploadPanel from "~/components/upload/UploadPanel";
import { CONFIG } from "~/server/config.server";
import { getFileTree } from "~/server/core.server";
import { handleFileAction } from "~/server/file-actions.server";
import type { Route } from "./+types/home";

export function meta() {
	return [
		{ title: "ShareBox" },
		{ name: "description", content: "ShareBox 文件管理工作区" },
	];
}
export async function loader() {
	return { fileTree: await getFileTree(CONFIG.datadir) };
}
export async function action({ request }: Route.ActionArgs) {
	return handleFileAction(request);
}

export default function Home({ loaderData }: Route.ComponentProps) {
	return (
		<WorkspaceLayout>
			<FileBrowser fileTree={loaderData.fileTree} />
			<UploadPanel />
		</WorkspaceLayout>
	);
}
