import pino from "pino";
import { loadEnv } from "./config.server";

loadEnv();

export const LOGGER_LEVEL = process.env.LOGGER_LEVEL || "info";

export const logger = pino(
	{
		level: LOGGER_LEVEL,
		name: "sharebox",
	},
	process.stdout,
);
