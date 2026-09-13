import { loadEnvFile } from "node:process";
import pino from "pino";

try {
	loadEnvFile();
} catch {
	console.log("No .env file found, using environment variables");
}
export const LOGGER_LEVEL = process.env.LOGGER_LEVEL || "info";

export const logger = pino(
	{
		level: LOGGER_LEVEL,
		name: "sharebox",
	},
	process.stdout,
);
