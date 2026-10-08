import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger.server";

function ensureDirectory(directory: string, mode: number) {
	const existing = fs.lstatSync(directory, { throwIfNoEntry: false });
	if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) {
		throw new Error(`Storage path is not a directory: ${directory}`);
	}
	fs.mkdirSync(directory, { recursive: true, mode });
	const stats = fs.lstatSync(directory);
	if (!stats.isDirectory() || stats.isSymbolicLink()) {
		throw new Error(`Storage path is not a directory: ${directory}`);
	}
	fs.accessSync(
		directory,
		fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK,
	);
}

export function initializeStorage(stateDirectory: string) {
	const requestedRoot = path.resolve(stateDirectory);
	try {
		ensureDirectory(requestedRoot, 0o755);
		const stateDir = fs.realpathSync(requestedRoot);
		const datadir = path.join(stateDir, "data");
		const tempdir = path.join(stateDir, "tmp");
		ensureDirectory(datadir, 0o755);
		ensureDirectory(tempdir, 0o700);
		// Existing mounts may have broader permissions than newly created paths.
		fs.chmodSync(tempdir, 0o700);
		for (const name of ["tus", "tus-receipts"]) {
			const directory = path.join(tempdir, name);
			ensureDirectory(directory, 0o700);
			fs.chmodSync(directory, 0o700);
		}
		logger.info(
			{ stateDir, dataDir: datadir, tempDir: tempdir },
			"Storage initialized",
		);
		return { stateDir, datadir, tempdir };
	} catch (err) {
		logger.error(
			{ err, stateDir: requestedRoot },
			"Storage initialization failed",
		);
		throw err;
	}
}
