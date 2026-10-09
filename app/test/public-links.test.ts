import { expect, it } from "vitest";
import { publicDownloadUrl, publicPageUrl } from "../utils/public-links";

it("generates public links on the same host without leaking filename URL characters", () => {
	const origin = "https://sharebox.example.com:8443";
	const filename = "资料/中文 #?% &+.txt";
	const download = new URL(publicDownloadUrl(filename), origin);
	expect(download.origin).toBe(origin);
	expect(download.pathname).toBe("/public/download");
	expect(download.searchParams.get("path")).toBe(filename);
	expect(download.hash).toBe("");
	const directory = new URL(publicPageUrl("资料/子目录"), origin);
	expect(directory.origin).toBe(origin);
	expect(directory.searchParams.get("path")).toBe("资料/子目录");
});
