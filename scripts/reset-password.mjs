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
	console.log("密码已重置，旧会话已失效。请启动 ShareBox 使用新密码登录。");
} catch {
	console.error(
		"密码重置失败，请确认已停止服务、管理员已初始化且状态数据库可写。",
	);
	process.exitCode = 1;
} finally {
	database.sqlite.close();
}
