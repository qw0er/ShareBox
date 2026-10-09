import ChevronRight from "@mui/icons-material/ChevronRight";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import InsertDriveFileOutlined from "@mui/icons-material/InsertDriveFileOutlined";
import { Box, ButtonBase, Stack, Typography } from "@mui/material";
import { Link } from "react-router";
import type { PublicEntry } from "~/server/public-files.server";
import { formatSize } from "~/utils/file-format";
import { publicDownloadUrl, publicPageUrl } from "~/utils/public-links";

export default function PublicEntryItem({ entry }: { entry: PublicEntry }) {
	const directory = entry.type === "directory";
	return (
		<ButtonBase
			component={Link}
			to={
				directory
					? publicPageUrl(entry.path)
					: (entry.downloadUrl ?? publicDownloadUrl(entry.path))
			}
			reloadDocument={!directory}
			download={directory ? undefined : entry.name}
			aria-label={`${directory ? "查看目录" : "下载"} ${entry.name}`}
			sx={{
				display: "flex",
				width: "100%",
				justifyContent: "flex-start",
				textAlign: "left",
				gap: 2,
				px: { xs: 2, sm: 3 },
				py: 2,
				borderTop: 1,
				borderColor: "divider",
				"&:hover": { bgcolor: "#f8faf8" },
				"&.Mui-focusVisible": {
					outline: "2px solid",
					outlineColor: "primary.main",
					outlineOffset: -2,
				},
			}}
		>
			{directory ? (
				<FolderOutlined color="primary" />
			) : (
				<InsertDriveFileOutlined sx={{ color: "text.secondary" }} />
			)}
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Typography
					sx={{ fontWeight: directory ? 600 : 500, overflowWrap: "anywhere" }}
				>
					{entry.name}
				</Typography>
				<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
					{directory ? "文件夹" : formatSize(entry.size)} ·{" "}
					{entry.modifiedAt.slice(0, 16).replace("T", " ")} UTC
				</Typography>
			</Box>
			<Stack
				direction="row"
				spacing={0.5}
				sx={{ alignItems: "center", color: "primary.main", flexShrink: 0 }}
			>
				<Typography variant="body2">{directory ? "查看" : "下载"}</Typography>
				{directory ? (
					<ChevronRight fontSize="small" />
				) : (
					<DownloadOutlined fontSize="small" />
				)}
			</Stack>
		</ButtonBase>
	);
}
