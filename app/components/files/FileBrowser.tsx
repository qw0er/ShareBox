import ChevronRight from "@mui/icons-material/ChevronRight";
import CreateNewFolderOutlined from "@mui/icons-material/CreateNewFolderOutlined";
import UploadFileOutlined from "@mui/icons-material/UploadFileOutlined";
import {
	Alert,
	Box,
	Button,
	ButtonBase,
	Snackbar,
	Stack,
	Typography,
} from "@mui/material";
import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "~/i18n";
import type { FileNode } from "~/types/files";
import type { ShareSummary } from "~/types/shares";
import { resolveDirectory } from "~/utils/directory-tree";
import { privateDownloadUrl } from "~/utils/download-links";
import { formatSize } from "~/utils/file-format";
import DeleteFileDialog from "./DeleteFileDialog";
import DirectoryBrowser from "./DirectoryBrowser";
import FileActionsMenu from "./FileActionsMenu";
import { FileEntryContent, fileEntryButtonSx } from "./FileEntryRow";
import NewFolderDialog from "./NewFolderDialog";
import RenameDialog from "./RenameDialog";
import TransferDialog, { type TransferTarget } from "./TransferDialog";

function ManagedEntry({
	node,
	onNavigate,
	onShare,
	onRename,
	onRemove,
	onTransfer,
	shared,
}: {
	node: FileNode;
	onNavigate: (path: string) => void;
	onShare: (path: string) => void;
	onRename: (node: FileNode) => void;
	onRemove: (node: FileNode) => void;
	onTransfer: (node: FileNode, operation: "move" | "copy") => void;
	shared: boolean;
}) {
	const t = useTranslation();
	const directory = node.type === "directory";
	return (
		<Stack direction="row" sx={{ borderTop: 1, borderColor: "divider" }}>
			<ButtonBase
				component={directory ? "button" : Link}
				to={directory ? undefined : privateDownloadUrl(node.path)}
				{...(!directory ? { reloadDocument: true } : {})}
				download={directory ? undefined : node.name}
				onClick={directory ? () => onNavigate(node.path) : undefined}
				aria-label={`${directory ? t("查看目录") : t("下载")} ${node.name}`}
				sx={{ ...fileEntryButtonSx, flex: 1, minWidth: 0 }}
			>
				<FileEntryContent
					name={node.name}
					directory={directory}
					detail={
						node.type === "directory"
							? `${t("文件夹")} · ${node.children.length} ${t("项")}`
							: formatSize(node.size)
					}
				/>
				{directory && (
					<Stack
						direction="row"
						sx={{ alignItems: "center", color: "primary.main", flexShrink: 0 }}
					>
						<Typography variant="body2">{t("查看")}</Typography>
						<ChevronRight fontSize="small" />
					</Stack>
				)}
			</ButtonBase>
			<Box sx={{ display: "flex", alignItems: "center", pr: { xs: 1, sm: 2 } }}>
				<FileActionsMenu
					node={node}
					shared={shared}
					onShare={onShare}
					onRename={onRename}
					onRemove={onRemove}
					onTransfer={onTransfer}
				/>
			</Box>
		</Stack>
	);
}

export default function FileBrowser({
	fileTree,
	shares,
	onShare,
	onUpload,
	path: requestedPath,
	onNavigate,
}: {
	onUpload: () => void;
	path: string;
	onNavigate: (path: string) => void;
	fileTree: FileNode[];
	shares: ShareSummary[];
	onShare: (path: string) => void;
}) {
	const t = useTranslation();
	const [transferTarget, setTransferTarget] = useState<TransferTarget | null>(
		null,
	);
	const [newFolder, setNewFolder] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [renameTarget, setRenameTarget] = useState<FileNode | null>(null);
	const [removeTarget, setRemoveTarget] = useState<FileNode | null>(null);
	const [warning, setWarning] = useState<string | null>(null);
	const { path, entries } = resolveDirectory(fileTree, requestedPath);
	return (
		<Box>
			{warning && (
				<Alert
					severity="warning"
					onClose={() => setWarning(null)}
					sx={{ mb: 2 }}
				>
					{t(warning)}
				</Alert>
			)}
			<DirectoryBrowser
				key={path}
				path={path}
				entries={entries}
				onNavigate={onNavigate}
				toolbar={
					<Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
						<Button
							variant="contained"
							startIcon={<UploadFileOutlined />}
							onClick={onUpload}
						>
							{t("上传文件")}
						</Button>
						<Button
							variant="outlined"
							startIcon={<CreateNewFolderOutlined />}
							onClick={() => setNewFolder(true)}
						>
							{t("新建文件夹")}
						</Button>
					</Stack>
				}
				renderEntry={(node) => (
					<ManagedEntry
						node={node}
						onNavigate={onNavigate}
						onShare={onShare}
						shared={shares.some((share) => share.targetPath === node.path)}
						onRename={setRenameTarget}
						onRemove={setRemoveTarget}
						onTransfer={(node, operation) =>
							setTransferTarget({ node, operation })
						}
					/>
				)}
			/>
			<Snackbar
				open={!!notice}
				autoHideDuration={5000}
				onClose={() => setNotice(null)}
			>
				<Alert severity="success" onClose={() => setNotice(null)}>
					{notice ? t(notice) : ""}
				</Alert>
			</Snackbar>
			{transferTarget && (
				<TransferDialog
					key={`${transferTarget.operation}-${transferTarget.node.path}`}
					target={transferTarget}
					shares={shares}
					fileTree={fileTree}
					onClose={() => setTransferTarget(null)}
					onWarning={setWarning}
					onSuccess={() => {
						setNotice(
							transferTarget.operation === "move" ? "已移动。" : "已复制。",
						);
						setTransferTarget(null);
					}}
				/>
			)}
			{newFolder && (
				<NewFolderDialog
					key={path}
					path={path}
					onClose={() => setNewFolder(false)}
					onSuccess={() => {
						setNewFolder(false);
						setNotice("文件夹已创建。");
					}}
				/>
			)}
			{renameTarget && (
				<RenameDialog
					key={renameTarget.path}
					node={renameTarget}
					onClose={() => setRenameTarget(null)}
					onSuccess={() => setNotice("名称已更新。")}
					onWarning={setWarning}
				/>
			)}
			{removeTarget && (
				<DeleteFileDialog
					key={removeTarget.path}
					node={removeTarget}
					onClose={() => setRemoveTarget(null)}
					onSuccess={() => setNotice("已删除。")}
					onWarning={setWarning}
				/>
			)}
		</Box>
	);
}
