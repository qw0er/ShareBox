// Loading the production build also loads and validates runtime configuration.
// Override only the framework's origin list; keep the rest of its build exports.
export * from "../build/server/index.js";

export const allowedActionOrigins = process.env.USER_URL?.trim()
	? [new URL(`https://${process.env.USER_URL.trim()}`).host]
	: [];
