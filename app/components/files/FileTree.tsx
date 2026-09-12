import { SimpleTreeView } from "@mui/x-tree-view";
import type { FileNode } from "~/types/files";
import { renderFileTreeItem } from "./FileTreeItem";

export default function FileTree({ nodes }: { nodes: FileNode[] }) {
	return (
		<SimpleTreeView
			aria-label="文件目录"
			expansionTrigger="content"
			sx={{
				p: 1.5,
				"& .MuiTreeItem-content": { borderRadius: 1.5, py: 0.5, px: 1 },
				"& .MuiTreeItem-groupTransition": {
					ml: 2,
					pl: 1,
					borderLeft: "1px solid",
					borderColor: "divider",
				},
			}}
		>
			{nodes.map(renderFileTreeItem)}
		</SimpleTreeView>
	);
}
