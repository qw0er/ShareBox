import type {
	FileActionContext,
	FileActionResult,
} from "./action-types.server";
import { CONFIG } from "./config.server";
import { fileOperationLevel, fileOperationMessage } from "./file-errors.server";
import { type TransferOperation, transferEntry } from "./files/transfer.server";

export async function handleTransferAction(
	{ form, requestLogger }: FileActionContext,
	operation: TransferOperation,
): Promise<FileActionResult> {
	const relativePath = form.get("path");
	const destination = form.get("destination");
	if (
		[...form.values()].some((value) => typeof value !== "string") ||
		typeof relativePath !== "string" ||
		typeof destination !== "string"
	) {
		requestLogger.warn({ operation }, "Rejected invalid transfer form");
		return { error: "Invalid form. Refresh the page and try again." };
	}
	try {
		requestLogger.info(
			{ operation, relativePath, destination },
			"File transfer started",
		);
		const toPath = await transferEntry(
			CONFIG.filesDir,
			relativePath,
			destination,
			operation,
		);
		requestLogger.info(
			{ operation, relativePath, toPath },
			"File transfer completed",
		);
		return {
			success: true,
			...(operation === "move"
				? {
						change: { kind: "rename" as const, fromPath: relativePath, toPath },
					}
				: {}),
		};
	} catch (error) {
		requestLogger[fileOperationLevel(error)](
			{ err: error, operation, relativePath, destination },
			"File transfer failed",
		);
		return { error: fileOperationMessage(error, operation) };
	}
}
