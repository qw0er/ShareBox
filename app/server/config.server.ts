import fs from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { LOGGER_LEVEL, logger } from "./logger.server";

try {
	loadEnvFile();
} catch {
	logger.info("No .env file found, using environment variables");
}

export const CONFIG = {
	datadir: getDATA_DIR(),
	loggerLevel: LOGGER_LEVEL,
	tempdir: process.env.UPLOAD_TMP_DIR || "",
	maxUploadBytes: getUploadLimit(),
	adminHost: import.meta.env.PROD
		? import.meta.env.SHAREBOX_ADMIN_HOST || ""
		: "",
};

logger.info({ dataDir: CONFIG.datadir }, "Configuration loaded");

function getDATA_DIR(): string {
	if (!process.env.DATA_DIR) {
		throw new Error("DATA_DIR environment variable is not set");
	}
	const datadir = path.resolve(process.env.DATA_DIR);
	if (!fs.existsSync(datadir)) {
		throw new Error(`Data directory does not exist: ${datadir}`);
	}
	if (!fs.lstatSync(datadir).isDirectory()) {
		throw new Error(`Data directory is not a directory: ${datadir}`);
	}
	return datadir;
}

function getUploadLimit(): number {
	const value = process.env.MAX_UPLOAD_BYTES || "1073741824";
	const limit = Number(value);
	if (
		!/^\d+$/.test(value) ||
		!Number.isSafeInteger(limit) ||
		limit <= 0 ||
		limit > Number.MAX_SAFE_INTEGER - 65536
	) {
		throw new Error("MAX_UPLOAD_BYTES must be a positive safe integer");
	}
	return limit;
}
