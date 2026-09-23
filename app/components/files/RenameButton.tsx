import DriveFileRenameOutlineOutlinedIcon from "@mui/icons-material/DriveFileRenameOutlineOutlined";
import {
	Box,
	Button,
	IconButton,
	Modal,
	Paper,
	TextField,
	Tooltip,
} from "@mui/material";
import { useState } from "react";
import { useFetcher } from "react-router";
import type { action } from "~/routes/home";
import type { FileNode } from "~/types/files";
export default function RenameButton({ node }: { node: FileNode }) {
	const fetcher = useFetcher<typeof action>();
	const busy = fetcher.state !== "idle";
	const [confirm, setConfirm] = useState(false);
	const [newName, setNewName] = useState(node.name);
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
					onClick={() => setConfirm(true)}
				>
					<DriveFileRenameOutlineOutlinedIcon fontSize="small" />
				</IconButton>
			</Tooltip>
			<Modal
				open={confirm}
				onClose={() => {
					if (!busy) setConfirm(false);
				}}
			>
				<Paper
					sx={{
						maxWidth: "xs",
						width: "xs",
						position: "absolute",
						top: "50%",
						left: "50%",
						transform: "translate(-50%, -50%)",
						backgroundColor: "background.paper",
					}}
				>
					<TextField
						value={newName}
						onChange={(e) => setNewName(e.target.value)}
					/>
					<Button onClick={() => setConfirm(false)}>取消</Button>
					<Button
						onClick={() => {
							if (!busy) {
								fetcher.submit(
									{ intent: "rename", path: node.path, newName },
									{ method: "post" },
								);
								setConfirm(false);
							}
						}}
					>
						确定
					</Button>
				</Paper>
			</Modal>
		</Box>
	);
}
