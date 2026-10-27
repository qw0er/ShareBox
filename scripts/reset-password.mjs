import fs from "node:fs";
import path from "node:path";
import { userDataDir } from "platformdirs";
import { resetAdministrator } from "../app/server/administrator.server.ts";
import { openDatabase } from "../app/server/db/client.server.ts";

const stateDir = path.resolve(
	process.env.STATE_DIR || userDataDir("sharebox", false),
);
const root = fs.lstatSync(stateDir);
if (!root.isDirectory() || root.isSymbolicLink())
	throw new Error("Invalid state directory");
const dbPath = path.join(stateDir, "state.db");
if (!fs.existsSync(dbPath))
	throw new Error("No existing state.db; start ShareBox first");
const database = openDatabase(dbPath);
try {
	await resetAdministrator(database);
	console.log(
		"Password reset. Existing sessions are invalid. Start ShareBox and sign in with the new password.",
	);
} catch {
	console.error(
		"Password reset failed. Ensure the service is stopped, the administrator is initialized, and the state database is writable.",
	);
	process.exitCode = 1;
} finally {
	database.sqlite.close();
}
