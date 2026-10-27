import FolderOutlined from "@mui/icons-material/FolderOutlined";
import {
	Alert,
	Box,
	Button,
	ButtonBase,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	Typography,
} from "@mui/material";
import { useEffect, useId, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslation } from "~/i18n";
import type { action } from "~/routes/files-move";
import type { FileNode } from "~/types/files";
import type { ShareSummary } from "~/types/shares";
import { resolveDirectory } from "~/utils/directory-tree";
import DirectoryBrowser from "./DirectoryBrowser";
import { fileEntryButtonSx } from "./FileEntryRow";

export type TransferTarget = { node: FileNode; operation: "move" | "copy" };

export default function TransferDialog({
	target: { node, operation },
	fileTree,
	shares,
	onClose,
	onSuccess,
	onWarning,
}: {
	target: TransferTarget;
	fileTree: FileNode[];
	shares: ShareSummary[];
	onClose: () => void;
	onSuccess: () => void;
	onWarning: (message: string) => void;
}) {
	const t = useTranslation();
	const id = useId();
	const fetcher = useFetcher<typeof action>();
	const busy = fetcher.state !== "idle";
	const parent = node.path.split("/").slice(0, -1).join("/");
	const [requestedPath, setPath] = useState(parent);
	const { path, entries } = resolveDirectory(fileTree, requestedPath);
	const invalid =
		path === parent || path === node.path || path.startsWith(`${node.path}/`);
	useEffect(() => {
		if (!busy && fetcher.data?.success) {
			if (fetcher.data.warning) onWarning(fetcher.data.warning);
			onSuccess();
		}
	}, [busy, fetcher.data, onSuccess, onWarning]);
	return (
		<Dialog
			open
			fullWidth
			maxWidth="sm"
			aria-labelledby={id}
			onClose={() => {
				if (!busy) onClose();
			}}
		>
			<Box>
				<DialogTitle id={id}>
					{t(operation === "move" ? "移动到…" : "复制到…")}
				</DialogTitle>
				<DialogContent>
					<DialogContentText sx={{ mb: 2, overflowWrap: "anywhere" }}>
						{t("为 {name} 选择目标文件夹。").replace("{name}", node.name)}
					</DialogContentText>
					<Box
						sx={{
							maxHeight: "45vh",
							overflow: "auto",
							pointerEvents: busy ? "none" : "auto",
						}}
						inert={busy}
					>
						<DirectoryBrowser
							foldersOnly
							key={path}
							path={path}
							entries={entries.filter(
								(entry) =>
									entry.type === "directory" && entry.path !== node.path,
							)}
							onNavigate={setPath}
							renderEntry={(entry) => (
								<ButtonBase
									onClick={() => setPath(entry.path)}
									sx={{
										...fileEntryButtonSx,
										borderTop: 1,
										borderColor: "divider",
									}}
									aria-label={`${t("查看目录")} ${entry.name}`}
								>
									<FolderOutlined color="primary" />
									<Typography sx={{ overflowWrap: "anywhere" }}>
										{entry.name}
									</Typography>
								</ButtonBase>
							)}
						/>
					</Box>
					<Typography variant="body2" sx={{ mt: 2, overflowWrap: "anywhere" }}>
						{t("目标目录：{path}").replace("{path}", path || t("全部文件"))}
					</Typography>
					<Typography variant="caption" color="text.secondary">
						{t(
							operation === "copy"
								? "副本默认私有，不会复制分享链接。"
								: "移动后已有分享链接保持有效。",
						)}
					</Typography>
					{shares.some(
						(share) =>
							share.kind === "directory" &&
							share.status === "valid" &&
							(path === share.targetPath ||
								path.startsWith(`${share.targetPath}/`)),
					) && (
						<Alert severity="warning" sx={{ mt: 2 }}>
							{t("此目录已公开，上传或添加的内容将对拥有分享链接的人可见。")}
						</Alert>
					)}
					{path === parent && (
						<Alert severity="info" sx={{ mt: 2 }}>
							{t("请选择其他文件夹。")}
						</Alert>
					)}
					{fetcher.data?.error && (
						<Alert severity="error" sx={{ mt: 2 }}>
							{t(fetcher.data.error)}
						</Alert>
					)}
				</DialogContent>
				<DialogActions sx={{ px: 3, pb: 2 }}>
					<Button disabled={busy} onClick={onClose}>
						{t("取消")}
					</Button>
					<Button
						variant="contained"
						disabled={busy || invalid}
						onClick={() => {
							if (!busy && !invalid)
								fetcher.submit(
									{ path: node.path, destination: path },
									{ method: "post", action: `/files/${operation}` },
								);
						}}
					>
						{t(
							busy
								? operation === "move"
									? "移动中…"
									: "复制中…"
								: operation === "move"
									? "移动到此处"
									: "复制到此处",
						)}
					</Button>
				</DialogActions>
			</Box>
		</Dialog>
	);
}
