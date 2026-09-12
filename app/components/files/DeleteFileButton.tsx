import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import {
	Alert,
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	IconButton,
	Tooltip,
} from "@mui/material";
import { useState } from "react";
import { useFetcher } from "react-router";
import type { action } from "~/routes/home";
import type { FileNode } from "~/types/files";

export default function DeleteFileButton({ node }: { node: FileNode }) {
	const fetcher = useFetcher<typeof action>();
	const [confirm, setConfirm] = useState(false);
	const busy = fetcher.state !== "idle";
	return (
		<Box
			onClick={(event) => event.stopPropagation()}
			onKeyDown={(event) => event.stopPropagation()}
			onMouseDown={(event) => event.stopPropagation()}
		>
			<Tooltip title="删除">
				<IconButton
					size="small"
					aria-label={`删除 ${node.name}`}
					onClick={() => setConfirm(true)}
					disabled={busy}
					sx={{
						color: "text.secondary",
						"&:hover": { color: "error.main", bgcolor: "#fff0ef" },
					}}
				>
					<DeleteOutlined fontSize="small" />
				</IconButton>
			</Tooltip>
			<Dialog
				open={confirm}
				onClose={() => {
					if (!busy) setConfirm(false);
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
					<Button disabled={busy} onClick={() => setConfirm(false)}>
						取消
					</Button>
					<Button
						variant="contained"
						color="error"
						disabled={busy}
						onClick={() =>
							fetcher.submit(
								{ intent: "remove", path: node.path },
								{ method: "post" },
							)
						}
					>
						{busy ? "删除中…" : "确认删除"}
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
}
