import { loadEnvFile } from "node:process";

import pino from "pino";

loadEnvFile();

export const LOGGER_LEVEL = process.env.LOGGER_LEVEL || "info";

export const logger = pino(
	{
		level: LOGGER_LEVEL,
		name: "sharebox",
	},
	process.stdout,
);
