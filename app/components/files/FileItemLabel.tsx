import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import InsertDriveFileOutlined from "@mui/icons-material/InsertDriveFileOutlined";
import { Stack, Typography } from "@mui/material";
import type { FileNode } from "~/types/files";
import { formatSize } from "~/utils/file-format";
import DeleteFileButton from "./DeleteFileButton";

export default function FileItemLabel({ node }: { node: FileNode }) {
	const Icon =
		node.type === "directory"
			? FolderOutlined
			: /\.(png|jpe?g|gif|webp|svg)$/i.test(node.name)
				? ImageOutlined
				: /\.(txt|md|pdf|docx?)$/i.test(node.name)
					? DescriptionOutlined
					: InsertDriveFileOutlined;
	return (
		<Stack
			direction="row"
			spacing={1.5}
			sx={{ alignItems: "center", minWidth: 0, minHeight: 48 }}
		>
			<Icon
				fontSize="small"
				sx={{
					color: node.type === "directory" ? "#a77b30" : "primary.main",
					flexShrink: 0,
				}}
			/>
			<Typography
				variant="body2"
				title={node.name}
				sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", fontWeight: 500 }}
			>
				{node.name}
			</Typography>
			<Typography
				variant="caption"
				color="text.secondary"
				sx={{ flexShrink: 0 }}
			>
				{node.type === "directory"
					? `${node.children.length} 项`
					: formatSize(node.size)}
			</Typography>
			<DeleteFileButton node={node} />
		</Stack>
	);
}
