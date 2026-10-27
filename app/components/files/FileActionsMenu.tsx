import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import DriveFileMoveOutlined from "@mui/icons-material/DriveFileMoveOutlined";
import DriveFileRenameOutlineOutlined from "@mui/icons-material/DriveFileRenameOutlineOutlined";
import FileCopyOutlined from "@mui/icons-material/FileCopyOutlined";
import MoreHoriz from "@mui/icons-material/MoreHoriz";
import ShareOutlined from "@mui/icons-material/ShareOutlined";
import {
	Alert,
	Divider,
	IconButton,
	ListItemIcon,
	ListItemText,
	Menu,
	MenuItem,
	Snackbar,
	Tooltip,
} from "@mui/material";
import { useId, useState } from "react";
import { useTranslation } from "~/i18n";
import type { FileNode } from "~/types/files";
import { privateDownloadUrl } from "~/utils/download-links";
import {
	isTextFile,
	MAX_COPY_TEXT_BYTES,
	readTextFile,
	TextFileTooLarge,
} from "./copy-text";

export default function FileActionsMenu({
	node,
	shared,
	onShare,
	onRename,
	onRemove,
	onTransfer,
}: {
	node: FileNode;
	shared: boolean;
	onShare: (path: string) => void;
	onRename: (node: FileNode) => void;
	onRemove: (node: FileNode) => void;
	onTransfer: (node: FileNode, operation: "move" | "copy") => void;
}) {
	const t = useTranslation();
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<"copied" | "large" | "failed" | null>(
		null,
	);
	const tooLarge = node.type === "file" && node.size > MAX_COPY_TEXT_BYTES;
	async function copy() {
		setBusy(true);
		try {
			const text = await readTextFile(node.path);
			await navigator.clipboard.writeText(text);
			setMessage("copied");
		} catch (error) {
			setMessage(error instanceof TextFileTooLarge ? "large" : "failed");
		} finally {
			setBusy(false);
		}
	}

	const id = useId();
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const close = () => setAnchor(null);
	return (
		<>
			<Tooltip title={t("文件操作")}>
				<IconButton
					id={`${id}-button`}
					aria-label={`${t("文件操作")} ${node.name}`}
					aria-haspopup="menu"
					aria-controls={anchor ? id : undefined}
					aria-expanded={!!anchor}
					onClick={(event) => setAnchor(event.currentTarget)}
				>
					<MoreHoriz />
				</IconButton>
			</Tooltip>
			<Menu
				id={id}
				anchorEl={anchor}
				open={!!anchor}
				onClose={close}
				slotProps={{ list: { "aria-labelledby": `${id}-button` } }}
			>
				{node.type === "file" && (
					<MenuItem
						component="a"
						href={privateDownloadUrl(node.path)}
						download={node.name}
						onClick={close}
					>
						<ListItemIcon>
							<DownloadOutlined fontSize="small" />
						</ListItemIcon>
						<ListItemText>{t("下载")}</ListItemText>
					</MenuItem>
				)}
				{node.type === "file" && (
					<MenuItem
						onClick={() => {
							close();
							onShare(node.path);
						}}
					>
						<ListItemIcon>
							<ShareOutlined fontSize="small" />
						</ListItemIcon>
						<ListItemText>{t(shared ? "管理分享" : "分享")}</ListItemText>
					</MenuItem>
				)}
				{node.type === "file" && isTextFile(node.name) && (
					<MenuItem
						disabled={tooLarge || busy}
						onClick={() => {
							close();
							void copy();
						}}
					>
						<ListItemIcon>
							<ContentCopyOutlined fontSize="small" />
						</ListItemIcon>
						<ListItemText
							primary={t("复制文件内容")}
							secondary={
								tooLarge ? t("仅支持复制不超过 1 MiB 的文本文件。") : undefined
							}
						/>
					</MenuItem>
				)}
				<MenuItem
					onClick={() => {
						close();
						onRename(node);
					}}
				>
					<ListItemIcon>
						<DriveFileRenameOutlineOutlined fontSize="small" />
					</ListItemIcon>
					<ListItemText>{t("重命名")}</ListItemText>
				</MenuItem>
				<MenuItem
					onClick={() => {
						close();
						onTransfer(node, "move");
					}}
				>
					<ListItemIcon>
						<DriveFileMoveOutlined fontSize="small" />
					</ListItemIcon>
					<ListItemText>{t("移动到…")}</ListItemText>
				</MenuItem>
				<MenuItem
					onClick={() => {
						close();
						onTransfer(node, "copy");
					}}
				>
					<ListItemIcon>
						<FileCopyOutlined fontSize="small" />
					</ListItemIcon>
					<ListItemText>{t("复制到…")}</ListItemText>
				</MenuItem>
				<Divider />
				<MenuItem
					sx={{ color: "error.main" }}
					onClick={() => {
						close();
						onRemove(node);
					}}
				>
					<ListItemIcon sx={{ color: "inherit" }}>
						<DeleteOutlined fontSize="small" />
					</ListItemIcon>
					<ListItemText>{t("删除")}</ListItemText>
				</MenuItem>
			</Menu>
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
