import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger.server";

const FILES_DIR = "files";
const STAGING_DIR = "staging";
const LEGACY_DATA_DIR = "data";
const LEGACY_TMP_DIR = "tmp";
const LEGACY_MIGRATION_HINT =
	'Legacy storage layout detected. Stop ShareBox and run "npm run migrate:state" (or "node scripts/migrate-state.mjs") before starting.';

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

function exists(target: string) {
	return fs.lstatSync(target, { throwIfNoEntry: false }) !== undefined;
}

/**
 * Refuse to start on the previous public layout so an empty new tree never
 * hides existing files or in-progress uploads.
 */
function assertNoLegacyLayout(stateDir: string) {
	const hasLegacyFiles = exists(path.join(stateDir, LEGACY_DATA_DIR));
	const hasLegacyUploads =
		exists(path.join(stateDir, LEGACY_TMP_DIR, "tus")) ||
		exists(path.join(stateDir, LEGACY_TMP_DIR, "tus-receipts"));
	const hasCurrentLayout =
		exists(path.join(stateDir, FILES_DIR)) ||
		exists(path.join(stateDir, STAGING_DIR));

	if (hasLegacyFiles || hasLegacyUploads) {
		if (hasCurrentLayout) {
			throw new Error(
				`Ambiguous storage layout at ${stateDir}: legacy and current directories coexist. ${LEGACY_MIGRATION_HINT}`,
			);
		}
		throw new Error(`${LEGACY_MIGRATION_HINT} State directory: ${stateDir}`);
	}
}

export function initializeStorage(stateDirectory: string) {
	const requestedRoot = path.resolve(stateDirectory);
	try {
		ensureDirectory(requestedRoot, 0o700);
		const stateDir = fs.realpathSync(requestedRoot);
		assertNoLegacyLayout(stateDir);

		// The state root now holds private files, upload staging and share rules.
		fs.chmodSync(stateDir, 0o700);
		const filesDir = path.join(stateDir, FILES_DIR);
		const stagingDir = path.join(stateDir, STAGING_DIR);
		ensureDirectory(filesDir, 0o700);
		ensureDirectory(stagingDir, 0o700);
		fs.chmodSync(filesDir, 0o700);
		fs.chmodSync(stagingDir, 0o700);
		for (const name of ["tus", "tus-receipts"]) {
			const directory = path.join(stagingDir, name);
			ensureDirectory(directory, 0o700);
			fs.chmodSync(directory, 0o700);
		}
		logger.info({ stateDir, filesDir, stagingDir }, "Storage initialized");
		return { stateDir, filesDir, stagingDir };
	} catch (err) {
		logger.error(
			{ err, stateDir: requestedRoot },
			"Storage initialization failed",
		);
		throw err;
	}
}
