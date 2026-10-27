import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import { Alert, Button, Snackbar, Stack, Tooltip } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "~/i18n";

export default function ShareLinkControls({
	shareId,
	disabled = false,
	compact = false,
}: {
	shareId: string;
	disabled?: boolean;
	compact?: boolean;
}) {
	const t = useTranslation();
	const [message, setMessage] = useState<"copied" | "failed" | null>(null);
	return (
		<Stack spacing={1}>
			<Stack direction="row" spacing={compact ? 0 : 1}>
				<Tooltip title={t("复制链接")}>
					<Button
						size="small"
						disabled={disabled}
						aria-label={t("复制链接")}
						sx={compact ? { minWidth: 32, p: 0.75 } : undefined}
						startIcon={compact ? undefined : <ContentCopyOutlined />}
						onClick={async () => {
							try {
								await navigator.clipboard.writeText(
									`${window.location.origin}/s/${shareId}`,
								);
								setMessage("copied");
							} catch {
								setMessage("failed");
							}
						}}
					>
						{compact ? <ContentCopyOutlined fontSize="small" /> : t("复制链接")}
					</Button>
				</Tooltip>
				<Tooltip title={t("打开")}>
					<Button
						size="small"
						disabled={disabled}
						aria-label={t("打开")}
						sx={compact ? { minWidth: 32, p: 0.75 } : undefined}
						startIcon={compact ? undefined : <OpenInNewOutlined />}
						component="a"
						href={`/s/${shareId}`}
						target="_blank"
						rel="noopener noreferrer"
					>
						{compact ? <OpenInNewOutlined fontSize="small" /> : t("打开")}
					</Button>
				</Tooltip>
			</Stack>
			{compact ? (
				<Snackbar
					open={message !== null}
					autoHideDuration={4000}
					onClose={() => setMessage(null)}
				>
					<Alert
						severity={message === "copied" ? "success" : "warning"}
						onClose={() => setMessage(null)}
					>
						{message === "copied"
							? t("链接已复制")
							: t("无法复制，请在管理分享对话框中手动选择链接复制。")}
					</Alert>
				</Snackbar>
			) : (
				message && (
					<Alert
						severity={message === "copied" ? "success" : "warning"}
						onClose={() => setMessage(null)}
					>
						{message === "copied"
							? t("链接已复制")
							: t("无法复制，请在管理分享对话框中手动选择链接复制。")}
					</Alert>
				)
			)}
		</Stack>
	);
}
