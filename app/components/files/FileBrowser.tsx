import FolderOutlined from "@mui/icons-material/FolderOutlined";
import Refresh from "@mui/icons-material/Refresh";
import {
	Box,
	Button,
	Chip,
	Divider,
	Paper,
	Stack,
	Typography,
} from "@mui/material";
import { useRevalidator } from "react-router";
import type { FileNode } from "~/types/files";
import FileTree from "./FileTree";

function countFiles(nodes: FileNode[]): number {
	return nodes.reduce(
		(count, node) =>
			count + (node.type === "file" ? 1 : countFiles(node.children)),
		0,
	);
}
export default function FileBrowser({ fileTree }: { fileTree: FileNode[] }) {
	const revalidator = useRevalidator();
	return (
		<Paper
			component="section"
			variant="outlined"
			aria-labelledby="files-title"
			sx={{ overflow: "hidden", minHeight: 440 }}
		>
			<Stack direction="row" spacing={1.5} sx={{ p: 3, alignItems: "center" }}>
				<Typography id="files-title" variant="h6" component="h2">
					全部文件
				</Typography>
				<Chip
					size="small"
					label={`${countFiles(fileTree)} 个文件`}
					sx={{ bgcolor: "#edf3ed", color: "primary.main" }}
				/>
				<Box sx={{ flex: 1 }} />
				<Button
					size="small"
					startIcon={<Refresh />}
					disabled={revalidator.state !== "idle"}
					onClick={() => revalidator.revalidate()}
				>
					{revalidator.state === "idle" ? "刷新" : "刷新中"}
				</Button>
			</Stack>
			<Divider />
			<Stack
				direction="row"
				spacing={1}
				sx={{ px: 3, py: 1.5, bgcolor: "#fafbf9", color: "text.secondary" }}
			>
				<FolderOutlined fontSize="small" />
				<Typography variant="body2">根目录</Typography>
				<Typography variant="body2" sx={{ ml: "auto !important" }}>
					大小 / 操作
				</Typography>
			</Stack>
			<Divider />
			{fileTree.length ? (
				<FileTree nodes={fileTree} />
			) : (
				<Stack spacing={1} sx={{ px: 3, py: 8, alignItems: "center" }}>
					<FolderOutlined sx={{ fontSize: 48, color: "#9aaa9c", mb: 1 }} />
					<Typography sx={{ fontWeight: 600 }}>这里还没有文件</Typography>
					<Typography variant="body2" color="text.secondary">
						上传第一个文件，开始整理你的内容。
					</Typography>
				</Stack>
			)}
		</Paper>
	);
}
