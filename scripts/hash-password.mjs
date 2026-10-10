import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { hashPassword } from "../app/server/password.server.ts";

if (!process.stdin.isTTY)
	throw new Error(
		"Run in an interactive terminal to keep passwords out of command arguments",
	);
let hidden = false;
const output = new Writable({
	write(chunk, _encoding, callback) {
		if (!hidden) process.stdout.write(chunk);
		callback();
	},
});
const prompt = createInterface({
	input: process.stdin,
	output,
	terminal: true,
});
try {
	process.stdout.write("管理员密码（输入不显示）：");
	hidden = true;
	const password = await prompt.question("");
	process.stdout.write("\n再次输入：");
	const confirmation = await prompt.question("");
	hidden = false;
	process.stdout.write("\n");
	if (!password || password.length > 1024 || password !== confirmation)
		throw new Error("Passwords must match and contain 1–1024 characters");
	console.log(`ADMIN_PASSWORD_HASH='${await hashPassword(password)}'`);
	console.log(`SESSION_SECRET=${randomBytes(32).toString("hex")}`);
} finally {
	hidden = false;
	prompt.close();
}
