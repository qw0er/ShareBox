import { Typography } from "@mui/material";
import { TreeItem } from "@mui/x-tree-view";
import type { FileNode } from "~/types/files";
import FileItemLabel from "./FileItemLabel";

export function renderFileTreeItem(node: FileNode) {
	return (
		<TreeItem
			key={node.path}
			itemId={node.path}
			label={<FileItemLabel node={node} />}
		>
			{node.type === "directory" &&
				(node.children.length ? (
					node.children.map(renderFileTreeItem)
				) : (
					<TreeItem
						itemId={`${node.path}/`}
						label={
							<Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
								空文件夹
							</Typography>
						}
						disabled
					/>
				))}
		</TreeItem>
	);
}
