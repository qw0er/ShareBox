import { SimpleTreeView, TreeItem } from "@mui/x-tree-view";
import type { FileNode } from "~/server/core.server";

function renderNode(node: FileNode) {
	return (
		<TreeItem
			key={node.path}
			itemId={node.path}
			label={
				node.type === "file" ? `${node.name} (${node.size} bytes)` : node.name
			}
		>
			{node.type === "directory" && node.children.map(renderNode)}
		</TreeItem>
	);
}

export default function FileTree({ fileTree }: { fileTree: FileNode[] }) {
	return <SimpleTreeView>{fileTree.map(renderNode)}</SimpleTreeView>;
}
