import { Alert, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import { useFetcher } from "react-router";
import { useTranslation } from "~/i18n";
import type { ShareActionResult, ShareSummary } from "~/types/shares";
import ShareLinkControls from "./ShareLinkControls";

function ShareEntry({
	share,
	onManage,
}: {
	share: ShareSummary;
	onManage: (path: string) => void;
}) {
	const t = useTranslation();
	const fetcher = useFetcher<ShareActionResult>();
	const busy = fetcher.state !== "idle";
	const valid = share.status === "valid";
	return (
		<Stack spacing={1} sx={{ pt: 2, borderTop: 1, borderColor: "divider" }}>
			<Stack direction="row" spacing={1} sx={{ alignItems: "start" }}>
				<Typography variant="body2" sx={{ flex: 1, overflowWrap: "anywhere" }}>
					{share.targetPath}
				</Typography>
				<Chip
					size="small"
					label={valid ? t("有效") : t("失效")}
					color={valid ? "success" : "default"}
					variant="outlined"
				/>
			</Stack>
			{valid && <ShareLinkControls shareId={share.id} disabled={busy} />}
			<Stack direction="row" spacing={1}>
				<Button
					size="small"
					disabled={busy}
					onClick={() => onManage(share.targetPath)}
				>
					{valid ? t("管理分享") : t("重新分享")}
				</Button>
				<Button
					size="small"
					color="error"
					disabled={busy}
					onClick={() =>
						fetcher.submit(
							{ shareId: share.id },
							{ method: "post", action: "/shares/revoke" },
						)
					}
				>
					{busy ? t("取消中…") : t("取消发布")}
				</Button>
			</Stack>
			{fetcher.data?.error && (
				<Alert severity="error">{t(fetcher.data.error)}</Alert>
			)}
		</Stack>
	);
}

export default function SharesPanel({
	shares,
	onManage,
}: {
	shares: ShareSummary[];
	onManage: (path: string) => void;
}) {
	const t = useTranslation();
	return (
		<Paper
			component="section"
			variant="outlined"
			aria-label={t("分享列表")}
			sx={{ p: 2.5 }}
		>
			<Stack spacing={2}>
				<Typography variant="h6">{t("文件分享")}</Typography>
				<Typography variant="body2" color="text.secondary">
					{t("仅显式分享的文件可通过链接匿名下载。")}
				</Typography>
				{!shares.length && (
					<Typography variant="body2" color="text.secondary">
						{t("暂无分享。在文件行的操作菜单中选择分享来创建链接。")}
					</Typography>
				)}
				{shares.map((share) => (
					<ShareEntry key={share.id} share={share} onManage={onManage} />
				))}
			</Stack>
		</Paper>
	);
}
