import { Stack } from "@mui/material";
import { useState } from "react";
import FileBrowser from "~/components/files/FileBrowser";
import WorkspaceLayout from "~/components/layout/WorkspaceLayout";
import ShareDialog from "~/components/shares/ShareDialog";
import SharesPanel from "~/components/shares/SharesPanel";
import UploadPanel from "~/components/upload/UploadPanel";
import { getAuth } from "~/server/auth.server";
import { CONFIG } from "~/server/config.server";
import { getFileTree } from "~/server/files/repository.server";
import { logger, withRequestLogging } from "~/server/logger.server";
import { shareStore } from "~/server/shares/runtime.server";
import { listShares } from "~/server/shares/service.server";
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
				shares,
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
	});
}
export default function Home({ loaderData }: Route.ComponentProps) {
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	return (
		<WorkspaceLayout>
			<FileBrowser
				fileTree={loaderData.fileTree}
				shares={loaderData.shares}
				onShare={setSelectedPath}
			/>
			<Stack spacing={3}>
				<UploadPanel maxUploadBytes={loaderData.maxUploadBytes} />
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
