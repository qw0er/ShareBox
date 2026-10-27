import ChevronRight from "@mui/icons-material/ChevronRight";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import LinkOffOutlined from "@mui/icons-material/LinkOffOutlined";
import { ButtonBase, Paper, Stack, Typography } from "@mui/material";
import { data, isRouteErrorResponse, Link } from "react-router";
import DirectoryBrowser from "~/components/files/DirectoryBrowser";
import {
	FileEntryContent,
	fileEntryButtonSx,
} from "~/components/files/FileEntryRow";
import PublicShareLayout from "~/components/shares/PublicShareLayout";
import { useTranslation } from "~/i18n";
import { CONFIG } from "~/server/config.server";
import { withRequestLogging } from "~/server/logger.server";
import { shareStore } from "~/server/shares/runtime.server";
import { loadSharePage, SHARE_HEADERS } from "~/server/shares/service.server";
import { directoryUrl, sharedDownloadUrl } from "~/utils/directory-links";
import { formatSize } from "~/utils/file-format";
import type { Route } from "./+types/share";

export function loader({ request, params }: Route.LoaderArgs) {
	return withRequestLogging(request, "shares.browse", async () =>
		data(
			await loadSharePage(shareStore, CONFIG.filesDir, params.shareId, request),
			{ headers: SHARE_HEADERS },
		),
	);
}

export function headers() {
	return {
		...SHARE_HEADERS,
		"Referrer-Policy": "no-referrer",
		"X-Content-Type-Options": "nosniff",
	};
}

export function meta({ loaderData }: Route.MetaArgs) {
	return [
		{ title: loaderData ? `${loaderData.name} · ShareBox` : "ShareBox" },
		{ name: "robots", content: "noindex, nofollow" },
	];
}

export function action({ request }: Route.ActionArgs) {
	return withRequestLogging(request, "shares.browse", () => {
		throw new Response(null, {
			status: 405,
			headers: { ...SHARE_HEADERS, Allow: "GET, HEAD" },
		});
	});
}

export default function SharePage({ loaderData }: Route.ComponentProps) {
	const t = useTranslation();
	const { name, path, entries, shareId } = loaderData;
	const browseUrl = (path: string) => directoryUrl(`/s/${shareId}`, path);
	return (
		<PublicShareLayout>
			<Stack spacing={1} sx={{ mb: 4 }}>
				<Typography
					variant="overline"
					color="primary"
					sx={{ letterSpacing: 2 }}
				>
					{t("共享文件夹")}
				</Typography>
				<Typography
					variant="h4"
					component="h1"
					sx={{ overflowWrap: "anywhere" }}
				>
					{name}
				</Typography>
				<Typography color="text.secondary">
					{t("浏览文件夹，下载你需要的文件。")}
				</Typography>
			</Stack>
			<DirectoryBrowser
				key={path}
				path={path}
				entries={entries}
				directoryUrl={browseUrl}
				rootLabel={name}
				renderEntry={(entry) => {
					const directory = entry.type === "directory";
					return (
						<ButtonBase
							component={Link}
							to={
								directory
									? browseUrl(entry.path)
									: sharedDownloadUrl(shareId, entry.path)
							}
							reloadDocument={!directory}
							download={directory ? undefined : entry.name}
							aria-label={`${directory ? t("查看目录") : t("下载")} ${entry.name}`}
							sx={{
								...fileEntryButtonSx,
								borderTop: 1,
								borderColor: "divider",
							}}
						>
							<FileEntryContent
								name={entry.name}
								directory={directory}
								detail={directory ? t("文件夹") : formatSize(entry.size ?? 0)}
							/>
							{directory ? (
								<ChevronRight color="primary" />
							) : (
								<DownloadOutlined color="action" />
							)}
						</ButtonBase>
					);
				}}
			/>
		</PublicShareLayout>
	);
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	const t = useTranslation();
	const unavailable = isRouteErrorResponse(error) && error.status === 404;
	return (
		<PublicShareLayout>
			<Paper
				variant="outlined"
				sx={{ p: { xs: 3, sm: 6 }, textAlign: "center" }}
			>
				<LinkOffOutlined
					sx={{ fontSize: 48, color: "text.secondary", mb: 2 }}
				/>
				<Typography variant="h5" component="h1" gutterBottom>
					{t(unavailable ? "分享不可用" : "暂时无法打开分享")}
				</Typography>
				<Typography color="text.secondary">
					{t(
						unavailable
							? "链接已失效或内容不存在，请联系分享者。"
							: "请稍后刷新页面重试。",
					)}
				</Typography>
			</Paper>
		</PublicShareLayout>
	);
}
