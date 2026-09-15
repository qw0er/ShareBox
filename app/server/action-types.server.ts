import type { Logger } from "pino";

import type { parseFileForm } from "./upload.server";

export type FileActionForm = Awaited<ReturnType<typeof parseFileForm>>;

export type FileActionContext = {
	form: FileActionForm;
	requestLogger: Logger;
};

export type FileActionResult = {
	results?: { filename: string; error?: string }[];
	success?: true;
	error?: string;
};
