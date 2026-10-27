import {
	Alert,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
} from "@mui/material";
import { useEffect } from "react";
import { useFetcher } from "react-router";
import { useTranslation } from "~/i18n";
import type { action } from "~/routes/files-remove";
import type { FileNode } from "~/types/files";

export default function DeleteFileDialog({
	node,
	onClose,
	onWarning,
}: {
	node: FileNode;
	onClose: () => void;
	onWarning: (message: string) => void;
}) {
	const t = useTranslation();
	const fetcher = useFetcher<typeof action>();
	const busy = fetcher.state !== "idle";
	useEffect(() => {
		if (!busy && fetcher.data?.success) {
			if (fetcher.data.warning) onWarning(fetcher.data.warning);
			onClose();
		}
	}, [busy, fetcher.data, onClose, onWarning]);
	return (
		<Dialog
			open
			onClose={() => {
				if (!busy) onClose();
			}}
			aria-labelledby={`remove-${node.path}`}
			maxWidth="xs"
			fullWidth
		>
			<DialogTitle id={`remove-${node.path}`}>
				{t(node.type === "directory" ? "删除文件夹？" : "删除文件？")}
			</DialogTitle>
			<DialogContent>
				<DialogContentText sx={{ overflowWrap: "anywhere" }}>
					{t("确认删除 {name}？此操作无法撤销。").replace("{name}", node.name)}
					{node.type === "directory" && t("仅支持删除空文件夹。")}
				</DialogContentText>
				{fetcher.data?.error && (
					<Alert severity="error" sx={{ mt: 2 }}>
						{t(fetcher.data.error)}
					</Alert>
				)}
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2 }}>
				<Button disabled={busy} onClick={() => onClose()}>
					{t("取消")}
				</Button>
				<Button
					variant="contained"
					color="error"
					disabled={busy}
					onClick={() =>
						fetcher.submit(
							{ path: node.path },
							{ method: "post", action: "/files/remove" },
						)
					}
				>
					{busy ? t("删除中…") : t("确认删除")}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
