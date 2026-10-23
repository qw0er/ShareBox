import type {
	FileActionContext,
	FileActionResult,
} from "./action-types.server";
import { CONFIG } from "./config.server";
import { logger } from "./logger.server";

export type FileActionOperation = "remove" | "rename";

export type FileActionPreparation =
	| { ok: true; context: FileActionContext }
	| { ok: false; result: FileActionResult };

export async function prepareFileAction(
	request: Request,
	operation: FileActionOperation,
): Promise<FileActionPreparation> {
	const requestLogger = logger.child({
		component: "file-actions",
		operation,
		method: request.method,
		path: new URL(request.url).pathname,
	});
	if (request.method !== "POST") {
		requestLogger.warn({ operation }, "Rejected non-POST action");
		return {
			ok: false,
			result: { error: "此操作仅支持提交表单，请刷新页面后重试。" },
		};
	}
	const expectedOrigin = CONFIG.adminHost
		? `https://${CONFIG.adminHost}`
		: new URL(request.url).origin;
	if (request.headers.get("origin") !== expectedOrigin) {
		requestLogger.warn({ operation }, "Rejected action origin");
		return {
			ok: false,
			result: { error: "请求来源无效，请从本站页面重新操作。" },
		};
	}
	let form: FormData;
	try {
		form = await request.formData();
	} catch (error) {
		requestLogger.warn({ err: error, operation }, "Unable to parse file form");
		return {
			ok: false,
			result: {
				error: "无法读取操作表单，请刷新页面后重试。",
			},
		};
	}

	return { ok: true, context: { form, requestLogger } };
}
