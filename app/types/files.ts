export type FileNode =
	| {
			name: string;
			path: string;
			type: "file";
			size: number;
	  }
	| {
			name: string;
			path: string;
			type: "directory";
			children: FileNode[];
	  };
