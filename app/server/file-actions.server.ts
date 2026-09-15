import type { FileActionResult } from "./action-types.server";
import { CONFIG } from "./config.server";
import { logger } from "./logger.server";
import { handleRemoveAction } from "./remove-action.server";
import { parseFileForm } from "./upload.server";
import { handleUploadAction } from "./upload-action.server";

const actionHandlers = {
	remove: handleRemoveAction,
	upload: handleUploadAction,
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
		return { error: "Method not allowed" };
	}
	const expectedOrigin = CONFIG.adminHost
		? `https://${CONFIG.adminHost}`
		: new URL(request.url).origin;
	if (request.headers.get("origin") !== expectedOrigin) {
		requestLogger.warn("Rejected action origin");
		return { error: "Invalid request origin" };
	}
	let form: Awaited<ReturnType<typeof parseFileForm>>;
	try {
		form = await parseFileForm(request);
	} catch (error) {
		requestLogger.warn({ err: error }, "Unable to parse file form");
		return {
			error: error instanceof Error ? error.message : "Invalid form data",
		};
	}
	const formData = form.fields;
	const intent = formData.get("intent");
	try {
		if (!isFileActionIntent(intent)) {
			requestLogger.warn(
				{ intent: typeof intent === "string" ? intent : null },
				"Invalid file action",
			);
			return { error: "Invalid action" };
		}

		return await actionHandlers[intent]({ form, requestLogger });
	} finally {
		await form.cleanup();
	}
}

function isFileActionIntent(intent: unknown): intent is FileActionIntent {
	return typeof intent === "string" && intent in actionHandlers;
}
