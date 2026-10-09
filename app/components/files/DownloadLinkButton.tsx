import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import LinkOutlined from "@mui/icons-material/LinkOutlined";
import {
	Alert,
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
import { useId, useState } from "react";
import type { FileNode } from "~/types/files";
import { publicDownloadUrl } from "~/utils/public-links";

export default function DownloadLinkButton({ node }: { node: FileNode }) {
	const [open, setOpen] = useState(false);
	const [result, setResult] = useState<"copied" | "failed" | null>(null);
	const [copying, setCopying] = useState(false);
	const titleId = useId();
	const [url, setUrl] = useState("");
	async function copyLink() {
		setCopying(true);
		try {
			await navigator.clipboard.writeText(url);
			setResult("copied");
		} catch {
			setResult("failed");
		} finally {
			setCopying(false);
		}
	}
	return (
		<>
			<Tooltip title="生成下载链接">
				<IconButton
					size="small"
					aria-label={`生成下载链接 ${node.name}`}
					onMouseDown={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
					onClick={(event) => {
						event.stopPropagation();
						setResult(null);
						setUrl(
							new URL(publicDownloadUrl(node.path), window.location.origin)
								.href,
						);
						setOpen(true);
					}}
				>
					<LinkOutlined fontSize="small" />
				</IconButton>
			</Tooltip>
			<Dialog
				open={open}
				onClose={() => setOpen(false)}
				aria-labelledby={titleId}
				maxWidth="sm"
				fullWidth
				onClick={(event) => event.stopPropagation()}
				onKeyDown={(event) => event.stopPropagation()}
			>
				<DialogTitle id={titleId}>下载链接</DialogTitle>
				<DialogContent>
					<DialogContentText sx={{ mb: 2, overflowWrap: "anywhere" }}>
						{node.name} 的公开下载地址，可复制后分享。
					</DialogContentText>
					<TextField
						label="下载地址"
						value={url}
						fullWidth
						slotProps={{ input: { readOnly: true } }}
						onFocus={(event) => event.target.select()}
					/>
					{result && (
						<Alert
							severity={result === "copied" ? "success" : "warning"}
							sx={{ mt: 2 }}
						>
							{result === "copied"
								? "链接已复制"
								: "无法访问剪贴板，请选中上方地址手动复制。"}
						</Alert>
					)}
				</DialogContent>
				<DialogActions sx={{ px: 3, pb: 2 }}>
					<Button onClick={() => setOpen(false)}>关闭</Button>
					<Button
						variant="contained"
						startIcon={<ContentCopyOutlined />}
						disabled={copying}
						onClick={copyLink}
					>
						{copying ? "复制中" : "复制链接"}
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
}
