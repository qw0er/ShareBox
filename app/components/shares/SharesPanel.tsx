import { Alert, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import { useFetcher } from "react-router";
import type { ShareActionResult, ShareSummary } from "~/types/shares";
import ShareLinkControls from "./ShareLinkControls";

function ShareEntry({
	share,
	onManage,
}: {
	share: ShareSummary;
	onManage: (path: string) => void;
}) {
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
					label={valid ? "有效" : "失效"}
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
					{valid ? "管理分享" : "重新分享"}
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
					{busy ? "取消中…" : "取消发布"}
				</Button>
			</Stack>
			{fetcher.data?.error && (
				<Alert severity="error">{fetcher.data.error}</Alert>
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
	return (
		<Paper
			component="section"
			variant="outlined"
			aria-label="分享列表"
			sx={{ p: 2.5 }}
		>
			<Stack spacing={2}>
				<Typography variant="h6">文件分享</Typography>
				<Typography variant="body2" color="text.secondary">
					仅显式分享的文件可通过链接匿名下载。
				</Typography>
				{!shares.length && (
					<Typography variant="body2" color="text.secondary">
						暂无分享。在文件行点击分享按钮创建链接。
					</Typography>
				)}
				{shares.map((share) => (
					<ShareEntry key={share.id} share={share} onManage={onManage} />
				))}
			</Stack>
		</Paper>
	);
}
