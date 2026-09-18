import type { Logger } from "pino";

export type FileActionContext = {
	form: FormData;
	requestLogger: Logger;
};

export type FileActionResult = {
	success?: true;
	error?: string;
};
