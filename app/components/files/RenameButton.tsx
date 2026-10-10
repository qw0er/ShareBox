import DriveFileRenameOutlineOutlinedIcon from "@mui/icons-material/DriveFileRenameOutlineOutlined";
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
	TextField,
	Tooltip,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import type { action } from "~/routes/home";
import type { FileNode } from "~/types/files";

export default function RenameButton({ node }: { node: FileNode }) {
	const fetcher = useFetcher<typeof action>();
	const busy = fetcher.state !== "idle";
	const [confirm, setConfirm] = useState(false);
	const [newName, setNewName] = useState(node.name);
	const invalidName =
		!newName || newName === "." || newName === ".." || /[\\/\0]/.test(newName);
	useEffect(() => {
		if (!busy && fetcher.data?.success) setConfirm(false);
	}, [busy, fetcher.data]);
	return (
		<Box
			onClick={(event) => event.stopPropagation()}
			onKeyDown={(event) => event.stopPropagation()}
			onMouseDown={(event) => event.stopPropagation()}
		>
			<Tooltip title="重命名">
				<IconButton
					disabled={busy}
					aria-label={`重命名 ${node.name}`}
					onClick={() => {
						fetcher.reset();
						setNewName(node.name);
						setConfirm(true);
					}}
				>
					<DriveFileRenameOutlineOutlinedIcon fontSize="small" />
				</IconButton>
			</Tooltip>
			<Dialog
				open={confirm}
				onClose={() => {
					if (!busy) setConfirm(false);
				}}
				aria-labelledby={`rename-${node.path}`}
				maxWidth="xs"
				fullWidth
			>
				<Box
					component="form"
					onSubmit={(event) => {
						event.preventDefault();
						if (!busy && !invalidName && newName !== node.name)
							fetcher.submit(
								{ intent: "rename", path: node.path, newName },
								{ method: "post" },
							);
					}}
				>
					<DialogTitle id={`rename-${node.path}`}>
						重命名{node.type === "directory" ? "文件夹" : "文件"}
					</DialogTitle>
					<DialogContent>
						<DialogContentText sx={{ mb: 2, overflowWrap: "anywhere" }}>
							为「{node.name}」输入新名称。
						</DialogContentText>
						<TextField
							label="新名称"
							value={newName}
							onChange={(event) => setNewName(event.target.value)}
							disabled={busy}
							fullWidth
							autoFocus
							error={invalidName}
							helperText={
								invalidName
									? "名称不能为空，也不能包含斜杠或反斜杠。"
									: node.type === "file"
										? "文件扩展名也是名称的一部分。"
										: "请输入文件夹名称。"
							}
						/>
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
							type="submit"
							variant="contained"
							disabled={busy || invalidName || newName === node.name}
						>
							{busy ? "保存中…" : "保存名称"}
						</Button>
					</DialogActions>
				</Box>
			</Dialog>
		</Box>
	);
}
