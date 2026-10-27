import {
	Alert,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	TextField,
} from "@mui/material";
import { useEffect, useId, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslation } from "~/i18n";
import type { ShareActionResult, ShareSummary } from "~/types/shares";
import ShareLinkControls from "./ShareLinkControls";

export default function ShareDialog({
	path,
	share,
	onClose,
}: {
	path: string;
	share?: ShareSummary;
	onClose: () => void;
}) {
	const t = useTranslation();
	const fetcher = useFetcher<ShareActionResult>();
	const busy = fetcher.state !== "idle";
	const titleId = useId();
	const [origin, setOrigin] = useState("");
	useEffect(() => {
		setOrigin(window.location.origin);
	}, []);
	useEffect(() => {
		if (!busy && fetcher.data?.success && !fetcher.data.shareId) onClose();
	}, [busy, fetcher.data, onClose]);
	const valid = share?.status === "valid";
	return (
		<Dialog
			open
			onClose={() => {
				if (!busy) onClose();
			}}
			maxWidth="sm"
			fullWidth
			aria-labelledby={titleId}
		>
			<DialogTitle id={titleId}>
				{valid ? t("管理分享") : share ? t("重新分享") : t("发布分享？")}
			</DialogTitle>
			<DialogContent>
				<DialogContentText sx={{ overflowWrap: "anywhere", mb: 2 }}>
					{path}
				</DialogContentText>
				{valid && share ? (
					<>
						<TextField
							label={t("分享链接")}
							value={origin ? `${origin}/s/${share.id}` : ""}
							fullWidth
							slotProps={{ input: { readOnly: true } }}
							onFocus={(event) => event.target.select()}
							sx={{ mb: 2 }}
						/>
						<ShareLinkControls
							key={share.id}
							shareId={share.id}
							disabled={busy}
						/>
					</>
				) : (
					<>
						{share && (
							<Alert severity="warning" sx={{ mb: 2 }}>
								{t(
									"原文件已移动、删除或被替换，旧链接已失效。重新分享将生成新链接。",
								)}
							</Alert>
						)}
						<DialogContentText>
							{t(
								"分享后，任何拥有链接的人都可以访问此内容。目录分享包含所有当前和后续新增的子项。取消发布可阻止后续访问。",
							)}
						</DialogContentText>
					</>
				)}
				{fetcher.data?.error && (
					<Alert severity="error" sx={{ mt: 2 }}>
						{t(fetcher.data.error)}
					</Alert>
				)}
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2, flexWrap: "wrap", gap: 1 }}>
				<Button disabled={busy} onClick={onClose}>
					{t("关闭")}
				</Button>
				{share && (
					<Button
						color="error"
						disabled={busy}
						onClick={() =>
							fetcher.submit(
								{ shareId: share.id },
								{ method: "post", action: "/shares/revoke" },
							)
						}
					>
						{t("取消发布")}
					</Button>
				)}
				{!valid && (
					<Button
						variant="contained"
						disabled={busy}
						onClick={() =>
							fetcher.submit(
								{ path },
								{ method: "post", action: "/shares/create" },
							)
						}
					>
						{busy ? t("处理中…") : share ? t("重新分享") : t("确认分享")}
					</Button>
				)}
			</DialogActions>
		</Dialog>
	);
}
