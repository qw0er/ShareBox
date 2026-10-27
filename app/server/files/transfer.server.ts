import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveEntry, SYMLINK_MESSAGE } from "./paths.server";

export type TransferOperation = "move" | "copy";

async function copyEntry(source: string, destination: string): Promise<void> {
	const stats = await fs.lstat(source);
	if (stats.isSymbolicLink()) throw new Error(SYMLINK_MESSAGE);
	if (stats.isFile()) {
		await fs.copyFile(source, destination, constants.COPYFILE_EXCL);
		return;
	}
	if (!stats.isDirectory()) throw new Error("Unsupported file type");
	// Own this destination only after an exclusive mkdir succeeds.
	await fs.mkdir(destination, { mode: 0o700 });
	try {
		for (const name of await fs.readdir(source)) {
			await copyEntry(path.join(source, name), path.join(destination, name));
		}
	} catch (error) {
		await fs.rm(destination, { recursive: true, force: true });
		throw error;
	}
}

async function moveEntry(
	source: string,
	destination: string,
	directory: boolean,
) {
	if (directory) {
		// Reserve the name exclusively; rename replaces only our empty reservation.
		await fs.mkdir(destination, { mode: 0o700 });
		try {
			await fs.rename(source, destination);
		} catch (error) {
			await fs.rmdir(destination);
			throw error;
		}
		return;
	}
	// link is atomic and cannot overwrite a competing upload/copy. It also keeps
	// the inode identity used by share links. Cross-filesystem moves are rejected.
	await fs.link(source, destination);
	try {
		await fs.unlink(source);
	} catch (error) {
		await fs.unlink(destination);
		throw error;
	}
}

export async function transferEntry(
	root: string,
	relativePath: string,
	destination: string,
	operation: TransferOperation,
) {
	const source = await resolveEntry(root, relativePath);
	const parent = await resolveEntry(root, destination, { allowRoot: true });
	if (!parent.targetStats.isDirectory())
		throw Object.assign(new Error("Not a directory"), { code: "ENOTDIR" });
	if (!source.targetStats.isFile() && !source.targetStats.isDirectory())
		throw new Error("Unsupported file type");
	if (
		destination === relativePath ||
		destination.startsWith(`${relativePath}/`) ||
		path.posix.dirname(relativePath).replace(/^\.$/, "") === destination
	) {
		throw new Error("Invalid destination");
	}
	const toPath = path.posix.join(
		destination,
		path.posix.basename(relativePath),
	);
	const target = path.join(parent.targetPath, path.basename(source.targetPath));
	if (operation === "move")
		await moveEntry(
			source.targetPath,
			target,
			source.targetStats.isDirectory(),
		);
	else await copyEntry(source.targetPath, target);
	return toPath;
}
