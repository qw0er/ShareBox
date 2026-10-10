import ChevronRight from "@mui/icons-material/ChevronRight";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import { ButtonBase, Stack, Typography } from "@mui/material";
import { Link } from "react-router";
import {
	FileEntryContent,
	fileEntryButtonSx,
} from "~/components/files/FileEntryRow";
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
			sx={{ ...fileEntryButtonSx, borderTop: 1, borderColor: "divider" }}
		>
			<FileEntryContent
				name={entry.name}
				directory={directory}
				detail={`${directory ? "文件夹" : formatSize(entry.size)} · ${entry.modifiedAt.slice(0, 16).replace("T", " ")} UTC`}
			/>
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
