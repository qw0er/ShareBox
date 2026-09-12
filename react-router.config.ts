import { loadEnvFile } from "node:process";
import type { Config } from "@react-router/dev/config";

loadEnvFile();
export default {
	// Config options...
	// Server-side render by default, to enable SPA mode set this to `false`
	ssr: true,
	allowedActionOrigins: [process.env.USER_URL ?? ""],
} satisfies Config;
