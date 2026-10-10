import ChevronRight from "@mui/icons-material/ChevronRight";
import { Box, ButtonBase, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { Link } from "react-router";
import type { FileNode } from "~/types/files";
import { formatSize } from "~/utils/file-format";
import { publicDownloadUrl } from "~/utils/public-links";
import DeleteFileButton from "./DeleteFileButton";
import DirectoryBrowser from "./DirectoryBrowser";
import DownloadLinkButton from "./DownloadLinkButton";
import { FileEntryContent, fileEntryButtonSx } from "./FileEntryRow";
import RenameButton from "./RenameButton";

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
}: {
	node: FileNode;
	onNavigate: (path: string) => void;
}) {
	const directory = node.type === "directory";
	return (
		<Stack
			direction={{ xs: "column", sm: "row" }}
			sx={{ borderTop: 1, borderColor: "divider" }}
		>
			<ButtonBase
				component={directory ? "button" : Link}
				to={directory ? undefined : publicDownloadUrl(node.path)}
				{...(!directory ? { reloadDocument: true } : {})}
				download={directory ? undefined : node.name}
				onClick={directory ? () => onNavigate(node.path) : undefined}
				aria-label={`${directory ? "查看目录" : "下载"} ${node.name}`}
				sx={{ ...fileEntryButtonSx, flex: 1, minWidth: 0 }}
			>
				<FileEntryContent
					name={node.name}
					directory={directory}
					detail={
						node.type === "directory"
							? `文件夹 · ${node.children.length} 项`
							: formatSize(node.size)
					}
				/>
				{directory && (
					<Stack
						direction="row"
						sx={{ alignItems: "center", color: "primary.main", flexShrink: 0 }}
					>
						<Typography variant="body2">查看</Typography>
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
				{node.type === "file" && <DownloadLinkButton node={node} />}
				<RenameButton node={node} />
				<DeleteFileButton node={node} />
			</Stack>
		</Stack>
	);
}

export default function FileBrowser({ fileTree }: { fileTree: FileNode[] }) {
	const [requestedPath, setPath] = useState("");
	const { path, entries } = resolveDirectory(fileTree, requestedPath);
	return (
		<Box>
			<DirectoryBrowser
				key={path}
				path={path}
				entries={entries}
				onNavigate={setPath}
				renderEntry={(node) => (
					<ManagedEntry node={node} onNavigate={setPath} />
				)}
			/>
		</Box>
	);
}
