import fs from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";

loadEnvFile();
if (!process.env.DATA_DIR) {
	throw new Error("DATA_DIR environment variable is not set");
}
const datadir = path.resolve(process.env.DATA_DIR);
if (!fs.existsSync(datadir)) {
	throw new Error(`Data directory does not exist: ${datadir}`);
}
if (!fs.statSync(datadir).isDirectory()) {
	throw new Error(`Data directory is not a directory: ${datadir}`);
}
export const CONFIG = {
	datadir: datadir,
};

console.log("Data directory:", CONFIG.datadir);
