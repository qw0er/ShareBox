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
				删除{node.type === "directory" ? "文件夹" : "文件"}？
			</DialogTitle>
			<DialogContent>
				<DialogContentText sx={{ overflowWrap: "anywhere" }}>
					确认删除「{node.name}」？此操作无法撤销。
					{node.type === "directory" && "仅支持删除空文件夹。"}
				</DialogContentText>
				{fetcher.data?.error && (
					<Alert severity="error" sx={{ mt: 2 }}>
						{fetcher.data.error}
					</Alert>
				)}
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2 }}>
				<Button disabled={busy} onClick={() => onClose()}>
					取消
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
					{busy ? "删除中…" : "确认删除"}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
