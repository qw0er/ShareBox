import type { FileActionResult } from "./action-types.server";
import { CONFIG } from "./config.server";
import { logger } from "./logger.server";
import { handleRemoveAction } from "./remove-action.server";
import { handleRenameAction } from "./rename-action.server";

const actionHandlers = {
	remove: handleRemoveAction,
	rename: handleRenameAction,
} as const;

type FileActionIntent = keyof typeof actionHandlers;

export async function handleFileAction(
	request: Request,
): Promise<FileActionResult> {
	const requestLogger = logger.child({
		component: "file-actions",
		method: request.method,
		path: new URL(request.url).pathname,
	});
	if (request.method !== "POST") {
		requestLogger.warn("Rejected non-POST action");
		return { error: "此操作仅支持提交表单，请刷新页面后重试。" };
	}
	const expectedOrigin = CONFIG.adminHost
		? `https://${CONFIG.adminHost}`
		: new URL(request.url).origin;
	if (request.headers.get("origin") !== expectedOrigin) {
		requestLogger.warn("Rejected action origin");
		return { error: "请求来源无效，请从本站页面重新操作。" };
	}
	let form: FormData;
	try {
		form = await request.formData();
	} catch (error) {
		requestLogger.warn({ err: error }, "Unable to parse file form");
		return {
			error: "无法读取操作表单，请刷新页面后重试。",
		};
	}
	const intent = form.get("intent");
	if (!isFileActionIntent(intent)) {
		requestLogger.warn(
			{ intent: typeof intent === "string" ? intent : null },
			"Invalid file action",
		);
		return { error: "不支持此操作，请刷新页面后重试。" };
	}

	return actionHandlers[intent]({ form, requestLogger });
}

function isFileActionIntent(intent: unknown): intent is FileActionIntent {
	return typeof intent === "string" && Object.hasOwn(actionHandlers, intent);
}
