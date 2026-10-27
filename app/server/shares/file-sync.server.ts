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
				"The file operation succeeded, but share records could not be synchronized. Refresh the share list and revoke invalid links.",
		};
	}
}
