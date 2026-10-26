#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { userDataDir } from "platformdirs";

const dryRun = process.argv.includes("--dry-run");
const stateRoot = path.resolve(
	process.env.STATE_DIR?.trim() || userDataDir("sharebox", false),
);

function fail(message) {
	console.error(`migrate-state: ${message}`);
	process.exit(1);
}

function entry(target) {
	try {
		return fs.lstatSync(target);
	} catch (error) {
		if (error.code === "ENOENT") return undefined;
		throw error;
	}
}

function assertDirectory(target, label, allowMissing = true) {
	const stats = entry(target);
	if (!stats) {
		if (allowMissing) return false;
		fail(`${label} does not exist: ${target}`);
	}
	if (!stats.isDirectory() || stats.isSymbolicLink())
		fail(`${label} is not a regular directory: ${target}`);
	return true;
}

function moveDirectory(from, to, label) {
	if (!assertDirectory(from, label)) return false;
	if (entry(to)) fail(`${label} target already exists: ${to}`);
	console.log(`${dryRun ? "[dry-run] " : ""}move ${from} -> ${to}`);
	if (!dryRun) fs.renameSync(from, to);
	return true;
}

function ensureDirectory(target, label) {
	const stats = entry(target);
	if (stats && (!stats.isDirectory() || stats.isSymbolicLink()))
		fail(`${label} is not a regular directory: ${target}`);
	if (!stats) {
		console.log(`${dryRun ? "[dry-run] " : ""}mkdir ${target}`);
		if (!dryRun) fs.mkdirSync(target, { recursive: true, mode: 0o700 });
	}
	if (!dryRun) fs.chmodSync(target, 0o700);
}

function main() {
	assertDirectory(stateRoot, "state directory", false);
	if (!dryRun) fs.chmodSync(stateRoot, 0o700);

	const data = path.join(stateRoot, "data");
	const files = path.join(stateRoot, "files");
	const tmp = path.join(stateRoot, "tmp");
	const staging = path.join(stateRoot, "staging");
	const legacyTus = path.join(tmp, "tus");
	const legacyReceipts = path.join(tmp, "tus-receipts");
	const tus = path.join(staging, "tus");
	const receipts = path.join(staging, "tus-receipts");

	const hasData = assertDirectory(data, "legacy data directory");
	const hasTmp = assertDirectory(tmp, "legacy tmp directory");
	const hasTus = hasTmp && assertDirectory(legacyTus, "legacy tus directory");
	const hasReceipts =
		hasTmp && assertDirectory(legacyReceipts, "legacy receipt directory");
	const hasLegacy = hasData || hasTus || hasReceipts;

	if (hasData && entry(files))
		fail(
			`both legacy data and current files directories exist under ${stateRoot}`,
		);

	if (!hasLegacy) {
		console.log(
			entry(files) && entry(staging)
				? "migrate-state: storage is already using the private layout"
				: "migrate-state: no legacy layout found; nothing to migrate",
		);
		return;
	}

	if (hasData) moveDirectory(data, files, "legacy data directory");
	ensureDirectory(files, "files directory");

	if (hasTus || hasReceipts) {
		ensureDirectory(staging, "staging directory");
		if (hasTus) moveDirectory(legacyTus, tus, "legacy tus directory");
		if (hasReceipts)
			moveDirectory(legacyReceipts, receipts, "legacy receipt directory");
	}
	ensureDirectory(staging, "staging directory");
	if (entry(tus)) ensureDirectory(tus, "tus directory");
	if (entry(receipts)) ensureDirectory(receipts, "receipt directory");

	if (!dryRun && entry(tmp) && fs.readdirSync(tmp).length === 0)
		fs.rmdirSync(tmp);

	console.log(
		`${dryRun ? "[dry-run] " : ""}migrated ${stateRoot}: files are private, no shares were created`,
	);
}

main();
