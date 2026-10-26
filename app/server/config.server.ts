import path from "node:path";
import { userDataDir } from "platformdirs";
import { openDatabase } from "./db/client.server";
import { LOGGER_LEVEL, logger } from "./logger.server";
import { initializeStorage } from "./storage.server";

const maxUploadBytes = getUploadLimit();
const adminHost = getAdminHost();
const storage = initializeStorage(
	process.env.STATE_DIR || userDataDir("sharebox", false),
);

export const DATABASE = openDatabase(path.join(storage.stateDir, "state.db"));

export const CONFIG = {
	dbPath: path.join(storage.stateDir, "state.db"),
	filesDir: storage.filesDir,
	stagingDir: storage.stagingDir,
	loggerLevel: LOGGER_LEVEL,
	maxUploadBytes,
	adminHost,
};

logger.info(
	{
		component: "config",
		filesDir: CONFIG.filesDir,
		stagingDir: CONFIG.stagingDir,
		adminHost,
		maxUploadBytes,
		loggerLevel: LOGGER_LEVEL,
	},
	"Configuration loaded",
);

function getAdminHost(): string {
	if (!import.meta.env.PROD) return "";
	const value = process.env.USER_URL?.trim();
	try {
		if (!value || /[\\/\s?#@*]/.test(value)) {
			throw new Error("Missing or invalid host");
		}
		const url = new URL(`https://${value}`);
		if (!url.hostname || url.port === "0") throw new Error("Invalid host");
		return url.host;
	} catch (err) {
		logger.fatal(
			{ component: "config", err },
			"Invalid runtime USER_URL configuration",
		);
		throw new Error(
			"USER_URL is required in production and must be a host without a protocol or path (for example admin.example.com)",
		);
	}
}

function getUploadLimit(): number {
	const value = process.env.MAX_UPLOAD_BYTES || "10737418240";
	const limit = Number(value);
	if (
		!/^\d+$/.test(value) ||
		!Number.isSafeInteger(limit) ||
		limit <= 0 ||
		limit > Number.MAX_SAFE_INTEGER - 65536
	) {
		logger.fatal(
			{ component: "config" },
			"MAX_UPLOAD_BYTES must be a positive safe integer",
		);
		throw new Error("MAX_UPLOAD_BYTES must be a positive safe integer");
	}
	return limit;
}
