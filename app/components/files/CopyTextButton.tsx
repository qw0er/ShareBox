import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import { Alert, IconButton, Snackbar, Tooltip } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "~/i18n";
import {
	MAX_COPY_TEXT_BYTES,
	readTextFile,
	TextFileTooLarge,
} from "./copy-text";

export default function CopyTextButton({
	name,
	path,
	size,
}: {
	name: string;
	path: string;
	size: number;
}) {
	const t = useTranslation();
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<"copied" | "large" | "failed" | null>(
		null,
	);
	const tooLarge = size > MAX_COPY_TEXT_BYTES;
	async function copy() {
		setBusy(true);
		try {
			const text = await readTextFile(path);
			await navigator.clipboard.writeText(text);
			setMessage("copied");
		} catch (error) {
			setMessage(error instanceof TextFileTooLarge ? "large" : "failed");
		} finally {
			setBusy(false);
		}
	}
	return (
		<>
			<Tooltip
				title={t(
					tooLarge ? "仅支持复制不超过 1 MiB 的文本文件。" : "复制文件内容",
				)}
			>
				<span>
					<IconButton
						size="small"
						disabled={tooLarge || busy}
						aria-label={`${t("复制文件内容")} ${name}`}
						onClick={() => void copy()}
					>
						<ContentCopyOutlined fontSize="small" />
					</IconButton>
				</span>
			</Tooltip>
			<Snackbar
				open={message !== null}
				autoHideDuration={5000}
				onClose={() => setMessage(null)}
			>
				<Alert
					severity={message === "copied" ? "success" : "error"}
					onClose={() => setMessage(null)}
				>
					{t(
						message === "copied"
							? "文件内容已复制。"
							: message === "large"
								? "仅支持复制不超过 1 MiB 的文本文件。"
								: "无法复制文件内容。请检查文件、登录状态和剪贴板权限。",
					)}
				</Alert>
			</Snackbar>
		</>
	);
}
