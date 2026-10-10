import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const HASH_PATTERN = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/;

export function isPasswordHash(value: string) {
	return HASH_PATTERN.test(value);
}
export async function hashPassword(password: string) {
	const salt = randomBytes(16).toString("hex");
	const key = await deriveKey(password, salt);
	return `scrypt$${salt}$${key.toString("hex")}`;
}
export async function verifyPassword(password: string, hash: string) {
	const match = HASH_PATTERN.exec(hash);
	if (!match || password.length > 1024) return false;
	const key = await deriveKey(password, match[1]);
	return timingSafeEqual(key, Buffer.from(match[2], "hex"));
}

function deriveKey(password: string, salt: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(password, salt, 64, SCRYPT_OPTIONS, (error, key) => {
			if (error) reject(error);
			else resolve(key);
		});
	});
}
