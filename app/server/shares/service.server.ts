import fs from "node:fs/promises";
import type { ShareSummary } from "~/types/shares";
import { deliverFile } from "../files/delivery.server";
import {
	INVALID_PATH_MESSAGE,
	resolveEntry,
	SYMLINK_MESSAGE,
} from "../files/paths.server";
import { logger } from "../logger.server";
import type { ShareStore } from "./store.server";

export const SHARE_HEADERS = {
	"Cache-Control": "no-store",
	"X-Robots-Tag": "noindex, nofollow",
};
export const isShareId = (value: string) => /^[a-f0-9]{32}$/.test(value);

function missingTarget(error: unknown) {
	const code = (error as NodeJS.ErrnoException)?.code;
	const message = error instanceof Error ? error.message : "";
	return (
		["ENOENT", "ENOTDIR", "ELOOP"].includes(code || "") ||
		[INVALID_PATH_MESSAGE, SYMLINK_MESSAGE].includes(message)
	);
}

export async function publishFile(
	store: ShareStore,
	filesDir: string,
	relativePath: string,
) {
	try {
		const { targetPath } = await resolveEntry(filesDir, relativePath);
		const stats = await fs.lstat(targetPath, { bigint: true });
		if (!stats.isFile() || stats.isSymbolicLink())
			throw new Response("Only regular files can be shared", { status: 400 });
		return store.publish(relativePath, {
			targetDev: stats.dev.toString(),
			targetIno: stats.ino.toString(),
		});
	} catch (error) {
		if (missingTarget(error))
			throw new Response("Invalid file path or file does not exist", {
				status: 400,
			});
		throw error;
	}
}

export async function downloadShare(
	store: ShareStore,
	filesDir: string,
	id: string,
	request: Request,
): Promise<Response> {
	try {
		const share = isShareId(id) ? store.find(id) : undefined;
		if (share?.kind !== "file")
			throw new Response("File not found", { status: 404 });
		// Identity is checked on the open descriptor, not just on a prior lstat.
		const response = await deliverFile(
			filesDir,
			share.targetPath,
			request,
			"shares",
			{ targetDev: share.targetDev, targetIno: share.targetIno },
		);
		response.headers.set("X-Robots-Tag", SHARE_HEADERS["X-Robots-Tag"]);
		return response;
	} catch (error) {
		const response =
			error instanceof Response
				? error
				: missingTarget(error)
					? new Response("File not found", { status: 404 })
					: new Response("Unable to read the file right now", { status: 500 });
		logger[response.status >= 500 ? "error" : "warn"](
			{ component: "shares", status: response.status },
			"Share download rejected",
		);
		for (const [key, value] of Object.entries(SHARE_HEADERS))
			response.headers.set(key, value);
		return response;
	}
}

export async function listShares(
	store: ShareStore,
	filesDir: string,
): Promise<ShareSummary[]> {
	return Promise.all(
		store.list().map(async (share) => {
			let valid = false;
			try {
				const { targetPath } = await resolveEntry(filesDir, share.targetPath);
				const stats = await fs.lstat(targetPath, { bigint: true });
				valid =
					share.kind === "file" &&
					stats.isFile() &&
					!stats.isSymbolicLink() &&
					stats.dev.toString() === share.targetDev &&
					stats.ino.toString() === share.targetIno;
			} catch (error) {
				if (!missingTarget(error)) throw error;
			}
			return {
				id: share.id,
				targetPath: share.targetPath,
				status: valid ? "valid" : "invalid",
			};
		}),
	);
}
