import type { FileActionResult } from "../action-types.server";
import { logger } from "../logger.server";
import type { ShareStore } from "./store.server";

export function synchronizeFileShares(
	result: FileActionResult,
	store: ShareStore,
): FileActionResult {
	const { change, ...response } = result;
	if (!result.success || !change) return response;
	try {
		if (change.kind === "rename")
			store.renamePaths(change.fromPath, change.toPath);
		else store.removePaths(change.path);
		return response;
	} catch {
		// Filesystem changes have already committed. Never invite a destructive retry.
		logger.error(
			{ component: "shares", operation: change.kind },
			"File operation succeeded but share synchronization failed",
		);
		return {
			...response,
			warning:
				"文件操作已完成，但分享记录同步失败。请刷新分享列表，检查并取消失效链接。",
		};
	}
}
