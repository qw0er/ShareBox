import ChevronRight from "@mui/icons-material/ChevronRight";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import DriveFileRenameOutlineOutlined from "@mui/icons-material/DriveFileRenameOutlineOutlined";
import ShareOutlined from "@mui/icons-material/ShareOutlined";
import {
	Alert,
	Box,
	ButtonBase,
	IconButton,
	Stack,
	Tooltip,
	Typography,
} from "@mui/material";
import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "~/i18n";
import type { FileNode } from "~/types/files";
import type { ShareSummary } from "~/types/shares";
import { privateDownloadUrl } from "~/utils/download-links";
import { formatSize } from "~/utils/file-format";
import DeleteFileDialog from "./DeleteFileDialog";
import DirectoryBrowser from "./DirectoryBrowser";
import { FileEntryContent, fileEntryButtonSx } from "./FileEntryRow";
import RenameDialog from "./RenameDialog";

function resolveDirectory(tree: FileNode[], path: string) {
	let entries = tree;
	const segments: string[] = [];
	for (const name of path.split("/").filter(Boolean)) {
		const directory = entries.find(
			(node) => node.name === name && node.type === "directory",
		);
		if (directory?.type !== "directory") break;
		segments.push(name);
		entries = directory.children;
	}
	return { path: segments.join("/"), entries };
}

function ManagedEntry({
	node,
	onNavigate,
	onShare,
	onRename,
	onRemove,
	shared,
}: {
	node: FileNode;
	onNavigate: (path: string) => void;
	onShare: (path: string) => void;
	onRename: (node: FileNode) => void;
	onRemove: (node: FileNode) => void;
	shared: boolean;
}) {
	const t = useTranslation();
	const directory = node.type === "directory";
	return (
		<Stack
			direction={{ xs: "column", sm: "row" }}
			sx={{ borderTop: 1, borderColor: "divider" }}
		>
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
			<Stack
				direction="row"
				sx={{
					alignItems: "center",
					justifyContent: "flex-end",
					pr: { xs: 2, sm: 3 },
					pb: { xs: 1, sm: 0 },
				}}
			>
				{node.type === "file" && (
					<Tooltip title={t("下载")}>
						<IconButton
							component="a"
							href={privateDownloadUrl(node.path)}
							download={node.name}
							size="small"
							aria-label={`${t("下载")} ${node.name}`}
						>
							<DownloadOutlined fontSize="small" />
						</IconButton>
					</Tooltip>
				)}
				{!directory && (
					<Tooltip title={shared ? t("管理分享") : t("分享")}>
						<IconButton
							size="small"
							aria-label={`${shared ? t("管理分享") : t("分享")} ${node.name}`}
							onClick={() => onShare(node.path)}
						>
							<ShareOutlined fontSize="small" />
						</IconButton>
					</Tooltip>
				)}
				<Tooltip title={t("重命名")}>
					<IconButton
						size="small"
						aria-label={`${t("重命名")} ${node.name}`}
						onClick={() => onRename(node)}
					>
						<DriveFileRenameOutlineOutlined fontSize="small" />
					</IconButton>
				</Tooltip>
				<Tooltip title={t("删除")}>
					<IconButton
						size="small"
						aria-label={`${t("删除")} ${node.name}`}
						onClick={() => onRemove(node)}
					>
						<DeleteOutlined fontSize="small" />
					</IconButton>
				</Tooltip>
			</Stack>
		</Stack>
	);
}

export default function FileBrowser({
	fileTree,
	shares,
	onShare,
}: {
	fileTree: FileNode[];
	shares: ShareSummary[];
	onShare: (path: string) => void;
}) {
	const t = useTranslation();
	const [renameTarget, setRenameTarget] = useState<FileNode | null>(null);
	const [removeTarget, setRemoveTarget] = useState<FileNode | null>(null);
	const [warning, setWarning] = useState<string | null>(null);
	const [requestedPath, setPath] = useState("");
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
				onNavigate={setPath}
				renderEntry={(node) => (
					<ManagedEntry
						node={node}
						onNavigate={setPath}
						onShare={onShare}
						shared={shares.some((share) => share.targetPath === node.path)}
						onRename={setRenameTarget}
						onRemove={setRemoveTarget}
					/>
				)}
			/>
			{renameTarget && (
				<RenameDialog
					key={renameTarget.path}
					node={renameTarget}
					onClose={() => setRenameTarget(null)}
					onWarning={setWarning}
				/>
			)}
			{removeTarget && (
				<DeleteFileDialog
					key={removeTarget.path}
					node={removeTarget}
					onClose={() => setRemoveTarget(null)}
					onWarning={setWarning}
				/>
			)}
		</Box>
	);
}
