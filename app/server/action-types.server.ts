import type { Logger } from "pino";

export type FileActionContext = {
	form: FormData;
	requestLogger: Logger;
};

export type FileChange =
	| { kind: "remove"; path: string }
	| { kind: "rename"; fromPath: string; toPath: string };

export type FileActionResult = {
	change?: FileChange;
	warning?: string;
	success?: true;
	error?: string;
};
