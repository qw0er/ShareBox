import fs from "node:fs/promises";
import path from "node:path";
import { redirect } from "react-router";
import type { BrowserEntry } from "~/components/files/DirectoryBrowser";
import { sharedDownloadUrl } from "~/utils/directory-links";
import { deliverFile } from "../files/delivery.server";
import { parseRelativePath, resolveEntry } from "../files/paths.server";
import { logger } from "../logger.server";

type DirectoryShare = {
	id: string;
	targetPath: string;
	targetDev: string;
	targetIno: string;
};

async function checkIdentity(filesDir: string, share: DirectoryShare) {
	const { targetPath } = await resolveEntry(filesDir, share.targetPath);
	const stats = await fs.lstat(targetPath, { bigint: true });
	if (
		!stats.isDirectory() ||
		stats.dev.toString() !== share.targetDev ||
		stats.ino.toString() !== share.targetIno
	)
		throw new Response("File not found", { status: 404 });
	return targetPath;
}

async function resolveSharedEntry(
	filesDir: string,
	share: DirectoryShare,
	request: Request,
) {
	const root = await checkIdentity(filesDir, share);
	const values = new URL(request.url).searchParams.getAll("path");
	if (values.length > 1) throw new Response("File not found", { status: 404 });
	const relative = values[0] || "";
	try {
		parseRelativePath(relative, { allowRoot: true });
	} catch {
		throw new Response("File not found", { status: 404 });
	}
	const entry = await resolveEntry(root, relative, { allowRoot: true });
	return { root, relative, ...entry };
}

export async function downloadDirectoryShare(
	filesDir: string,
	share: DirectoryShare,
	request: Request,
) {
	const { root, relative, targetStats } = await resolveSharedEntry(
		filesDir,
		share,
		request,
	);
	if (!targetStats.isFile())
		throw new Response("File not found", { status: 404 });
	return deliverFile(root, relative, request, "shares");
}

async function readEntries(root: string, relative: string, targetPath: string) {
	const entries: BrowserEntry[] = [];
	for (const entry of await fs.readdir(targetPath, { withFileTypes: true })) {
		if (!entry.isFile() && !entry.isDirectory()) continue;
		const child = relative ? `${relative}/${entry.name}` : entry.name;
		try {
			const { targetStats } = await resolveEntry(root, child);
			if (!targetStats.isFile() && !targetStats.isDirectory()) continue;
			entries.push({
				name: entry.name,
				path: child,
				type: targetStats.isDirectory() ? "directory" : "file",
				size: targetStats.isFile() ? targetStats.size : undefined,
				modifiedAt: targetStats.mtime.toISOString(),
			});
		} catch (error) {
			if (
				!["ENOENT", "ENOTDIR"].includes(
					(error as NodeJS.ErrnoException).code || "",
				) &&
				!(
					error instanceof Error &&
					error.message === "Symbolic links are not supported"
				)
			)
				throw error;
		}
	}
	return entries;
}

export async function readSharedDirectory(
	filesDir: string,
	share: DirectoryShare,
	request: Request,
) {
	const { root, relative, targetPath, targetStats } = await resolveSharedEntry(
		filesDir,
		share,
		request,
	);
	// Preserve previously issued file URLs while keeping file bodies out of page loaders.
	if (targetStats.isFile())
		throw redirect(sharedDownloadUrl(share.id, relative));
	if (!targetStats.isDirectory())
		throw new Response("File not found", { status: 404 });
	const entries = await readEntries(root, relative, targetPath);
	await checkIdentity(filesDir, share);
	logger.info(
		{ component: "shares", entries: entries.length },
		"Shared directory listed",
	);
	return {
		name: path.basename(share.targetPath),
		path: relative,
		entries,
		shareId: share.id,
	};
}
