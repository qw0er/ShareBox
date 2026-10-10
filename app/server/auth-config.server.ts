import { isPasswordHash } from "./password.server";

export function readAuthConfig(env: NodeJS.ProcessEnv, production: boolean) {
	const username = env.ADMIN_USERNAME?.trim();
	const passwordHash = env.ADMIN_PASSWORD_HASH;
	const secret = env.SESSION_SECRET;
	if (!username && !passwordHash && !secret && !production) return undefined;
	if (
		!username ||
		!passwordHash ||
		!isPasswordHash(passwordHash) ||
		!secret ||
		Buffer.byteLength(secret) < 32
	) {
		throw new Error(
			"Configure ADMIN_USERNAME, a valid ADMIN_PASSWORD_HASH and SESSION_SECRET (at least 32 bytes)",
		);
	}
	return { username, passwordHash, secret, secure: production };
}
