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
	if (!fs.statSync(datadir).isDirectory()) {
		throw new Error(`Data directory is not a directory: ${datadir}`);
	}
	return datadir;
}
