import LinkOffOutlined from "@mui/icons-material/LinkOffOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import {
	Alert,
	Chip,
	IconButton,
	Paper,
	Stack,
	Tooltip,
	Typography,
} from "@mui/material";
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
			<Stack
				direction="row"
				spacing={0.5}
				sx={{ alignItems: "center", minWidth: 0 }}
			>
				<Typography
					variant="body2"
					title={share.targetPath}
					noWrap
					sx={{ flex: 1, minWidth: 0 }}
				>
					{share.targetPath}
				</Typography>
				<Chip
					size="small"
					label={valid ? t("有效") : t("失效")}
					color={valid ? "success" : "default"}
					variant="outlined"
				/>
				{valid && (
					<ShareLinkControls shareId={share.id} disabled={busy} compact />
				)}
				<Tooltip title={valid ? t("管理分享") : t("重新分享")}>
					<IconButton
						size="small"
						disabled={busy}
						aria-label={`${valid ? t("管理分享") : t("重新分享")} ${share.targetPath}`}
						onClick={() => onManage(share.targetPath)}
					>
						<SettingsOutlined fontSize="small" />
					</IconButton>
				</Tooltip>
				<Tooltip title={busy ? t("取消中…") : t("取消发布")}>
					<IconButton
						size="small"
						color="error"
						aria-label={`${t("取消发布")} ${share.targetPath}`}
						disabled={busy}
						onClick={() =>
							fetcher.submit(
								{ shareId: share.id },
								{ method: "post", action: "/shares/revoke" },
							)
						}
					>
						<LinkOffOutlined fontSize="small" />
					</IconButton>
				</Tooltip>
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
