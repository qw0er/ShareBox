import fs from "node:fs/promises";
import path from "node:path";
import { deliverFile } from "../files/delivery.server";
import { parseRelativePath, resolveEntry } from "../files/paths.server";
import { logger } from "../logger.server";

type DirectoryShare = {
	id: string;
	targetPath: string;
	targetDev: string;
	targetIno: string;
};
const escapeHtml = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(character) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				character
			] || character,
	);

async function checkIdentity(filesDir: string, share: DirectoryShare) {
	const { targetPath } = await resolveEntry(filesDir, share.targetPath);
	const stats = await fs.lstat(targetPath, { bigint: true });
	if (
		!stats.isDirectory() ||
		stats.dev.toString() !== share.targetDev ||
		stats.ino.toString() !== share.targetIno
	)
		throw new Response("File not found", { status: 404 });
	return targetPath;
}

export async function browseDirectoryShare(
	filesDir: string,
	share: DirectoryShare,
	request: Request,
) {
	const root = await checkIdentity(filesDir, share);
	const values = new URL(request.url).searchParams.getAll("path");
	if (values.length > 1) throw new Response("File not found", { status: 404 });
	const relative = values[0] || "";
	try {
		parseRelativePath(relative, { allowRoot: true });
	} catch {
		throw new Response("File not found", { status: 404 });
	}
	const { targetPath, targetStats } = await resolveEntry(root, relative, {
		allowRoot: true,
	});
	if (targetStats.isFile())
		return deliverFile(root, relative, request, "shares");
	if (!targetStats.isDirectory())
		throw new Response("File not found", { status: 404 });
	const url = (value: string) =>
		`/s/${share.id}${value ? `?${new URLSearchParams({ path: value })}` : ""}`;
	const entries = await fs.readdir(targetPath, { withFileTypes: true });
	const rows: string[] = [];
	for (const entry of entries.sort(
		(a, b) =>
			Number(b.isDirectory()) - Number(a.isDirectory()) ||
			a.name.localeCompare(b.name),
	)) {
		if (!entry.isFile() && !entry.isDirectory()) continue;
		const child = relative ? `${relative}/${entry.name}` : entry.name;
		try {
			const resolved = await resolveEntry(root, child);
			if (!resolved.targetStats.isFile() && !resolved.targetStats.isDirectory())
				continue;
			rows.push(
				`<li><a href="${escapeHtml(url(child))}">${escapeHtml(entry.name)}${resolved.targetStats.isDirectory() ? "/" : ""}</a><span>${resolved.targetStats.isFile() ? `${resolved.targetStats.size.toLocaleString("en")} B` : ""}</span></li>`,
			);
		} catch (error) {
			if (
				!["ENOENT", "ENOTDIR"].includes(
					(error as NodeJS.ErrnoException).code || "",
				) &&
				!(
					error instanceof Error &&
					error.message === "Symbolic links are not supported"
				)
			)
				throw error;
		}
	}
	await checkIdentity(filesDir, share);
	logger.info(
		{ component: "shares", entries: rows.length },
		"Shared directory listed",
	);
	const title = escapeHtml(relative || path.basename(share.targetPath));
	const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · ShareBox</title><style>body{font:16px system-ui;margin:40px auto;padding:0 20px;max-width:800px;background:#f8fafc;color:#172033}h1,a{overflow-wrap:anywhere}li{display:flex;justify-content:space-between;gap:20px;padding:16px 0;border-bottom:1px solid #ddd}ul{padding:0}a{color:#245ac4}span{white-space:nowrap;color:#596579}</style><main><p>ShareBox · Shared directory / 共享目录</p><h1>${title}</h1>${relative ? `<a href="${escapeHtml(url(relative.split("/").slice(0, -1).join("/")))}">↑ Parent directory / 上级目录</a>` : ""}<ul>${rows.join("")}</ul>${rows.length ? "" : "<p>Empty directory / 空目录</p>"}</main></html>`;
	return new Response(request.method === "HEAD" ? null : html, {
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "no-store",
			"X-Robots-Tag": "noindex, nofollow",
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy":
				"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
			"Referrer-Policy": "no-referrer",
		},
	});
}
