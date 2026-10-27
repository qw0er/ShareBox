import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import { Alert, Button, Stack } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "~/i18n";

export default function ShareLinkControls({
	shareId,
	disabled = false,
}: {
	shareId: string;
	disabled?: boolean;
}) {
	const t = useTranslation();
	const [message, setMessage] = useState<"copied" | "failed" | null>(null);
	return (
		<Stack spacing={1}>
			<Stack direction="row" spacing={1}>
				<Button
					size="small"
					disabled={disabled}
					startIcon={<ContentCopyOutlined />}
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
					{t("复制链接")}
				</Button>
				<Button
					size="small"
					disabled={disabled}
					startIcon={<OpenInNewOutlined />}
					component="a"
					href={`/s/${shareId}`}
					target="_blank"
					rel="noopener noreferrer"
				>
					{t("打开")}
				</Button>
			</Stack>
			{message && (
				<Alert
					severity={message === "copied" ? "success" : "warning"}
					onClose={() => setMessage(null)}
				>
					{message === "copied"
						? t("链接已复制")
						: t("无法复制，请在管理分享对话框中手动选择链接复制。")}
				</Alert>
			)}
		</Stack>
	);
}
