import type { FileNode } from "~/types/files";

export function resolveDirectory(tree: FileNode[], path: string) {
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
