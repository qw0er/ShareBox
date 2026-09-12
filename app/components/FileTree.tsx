import { SimpleTreeView, TreeItem } from "@mui/x-tree-view";
import type { FileNode } from "~/server/core.server";
import FileItemLabel from "./FileItemLabel";

function renderNode(node: FileNode) {
	return (
		<TreeItem
			key={node.path}
			itemId={node.path}
			label={<FileItemLabel node={node} />}
		>
			{node.type === "directory" && node.children.map(renderNode)}
		</TreeItem>
	);
}

export default function FileTree({ fileTree }: { fileTree: FileNode[] }) {
	return <SimpleTreeView>{fileTree.map(renderNode)}</SimpleTreeView>;
}
