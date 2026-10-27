import {
	Alert,
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	TextField,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslation } from "~/i18n";
import type { action } from "~/routes/files-rename";
import type { FileNode } from "~/types/files";

export default function RenameDialog({
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
	const [newName, setNewName] = useState(node.name);
	const invalidName =
		!newName || newName === "." || newName === ".." || /[\\/\0]/.test(newName);
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
							{ path: node.path, newName },
							{ method: "post", action: "/files/rename" },
						);
				}}
			>
				<DialogTitle id={`rename-${node.path}`}>
					{t(node.type === "directory" ? "重命名文件夹" : "重命名文件")}
				</DialogTitle>
				<DialogContent>
					<DialogContentText sx={{ mb: 2, overflowWrap: "anywhere" }}>
						{t("为 {name} 输入新名称。").replace("{name}", node.name)}
					</DialogContentText>
					<TextField
						label={t("新名称")}
						value={newName}
						onChange={(event) => setNewName(event.target.value)}
						disabled={busy}
						fullWidth
						autoFocus
						error={invalidName}
						helperText={
							invalidName
								? t("名称不能为空，也不能包含斜杠或反斜杠。")
								: node.type === "file"
									? t("文件扩展名也是名称的一部分。")
									: t("请输入文件夹名称。")
						}
					/>
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
						type="submit"
						variant="contained"
						disabled={busy || invalidName || newName === node.name}
					>
						{busy ? t("保存中…") : t("保存名称")}
					</Button>
				</DialogActions>
			</Box>
		</Dialog>
	);
}
