import { Alert, Stack } from "@mui/material";
import { useRef, useState } from "react";
import { redirect } from "react-router";
import FileBrowser from "~/components/files/FileBrowser";
import WorkspaceLayout from "~/components/layout/WorkspaceLayout";
import ShareDialog from "~/components/shares/ShareDialog";
import SharesPanel from "~/components/shares/SharesPanel";
import UploadPanel from "~/components/upload/UploadPanel";
import { useTranslation } from "~/i18n";
import { getAuth } from "~/server/auth.server";
import { CONFIG } from "~/server/config.server";
import { getFileTree } from "~/server/files/repository.server";
import { logger, withRequestLogging } from "~/server/logger.server";
import { shareStore } from "~/server/shares/runtime.server";
import { listShares } from "~/server/shares/service.server";
import { directoryUrl } from "~/utils/directory-links";
import { resolveDirectory } from "~/utils/directory-tree";
import type { Route } from "./+types/home";

export function meta() {
	return [
		{ title: "ShareBox" },
		{ name: "description", content: "ShareBox file management workspace" },
	];
}
export async function loader({ request }: Route.LoaderArgs) {
	return withRequestLogging(request, "home", async () => {
		await getAuth().requireAdmin(request, true);
		const startedAt = Date.now();
		try {
			const [fileTree, shares] = await Promise.all([
				getFileTree(CONFIG.filesDir),
				listShares(shareStore, CONFIG.filesDir),
			]);
			const requestedPath = new URL(request.url).searchParams.get("path") || "";
			const { path } = resolveDirectory(fileTree, requestedPath);
			if (path !== requestedPath) throw redirect(directoryUrl("/", path));
			logger.debug(
				{
					component: "file-browser",
					rootEntries: fileTree.length,
					durationMs: Date.now() - startedAt,
				},
				"File tree loaded",
			);
			return {
				fileTree,
				path,
				shares,
				maxUploadBytes: CONFIG.maxUploadBytes,
			};
		} catch (error) {
			if (error instanceof Response) throw error;
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
	});
}
export default function Home({ loaderData }: Route.ComponentProps) {
	const t = useTranslation();
	const { path } = loaderData;
	const fileInput = useRef<HTMLInputElement>(null);
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	return (
		<WorkspaceLayout>
			<FileBrowser
				fileTree={loaderData.fileTree}
				path={path}
				directoryUrl={(path) => directoryUrl("/", path)}
				shares={loaderData.shares}
				onShare={setSelectedPath}
				onUpload={() => fileInput.current?.click()}
			/>
			<Stack spacing={3}>
				{loaderData.shares.some(
					(share) =>
						share.kind === "directory" &&
						share.status === "valid" &&
						(path === share.targetPath ||
							path.startsWith(`${share.targetPath}/`)),
				) && (
					<Alert severity="warning">
						{t("此目录已公开，上传或添加的内容将对拥有分享链接的人可见。")}
					</Alert>
				)}
				<UploadPanel
					maxUploadBytes={loaderData.maxUploadBytes}
					fileInputRef={fileInput}
					directory={path}
				/>
				<SharesPanel shares={loaderData.shares} onManage={setSelectedPath} />
			</Stack>
			{selectedPath !== null && (
				<ShareDialog
					key={selectedPath}
					path={selectedPath}
					share={loaderData.shares.find(
						(share) => share.targetPath === selectedPath,
					)}
					onClose={() => setSelectedPath(null)}
				/>
			)}
		</WorkspaceLayout>
	);
}

export function headers() {
	return { "Cache-Control": "no-store" };
}
