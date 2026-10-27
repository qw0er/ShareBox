import { expect, it } from "vitest";
import { privateDownloadUrl } from "../utils/download-links";

it("builds an encoded private download URL", () => {
	const url = new URL(
		privateDownloadUrl("资料/中文 #?%.txt"),
		"http://localhost",
	);
	expect(url.pathname).toBe("/download");
	expect(url.searchParams.get("path")).toBe("资料/中文 #?%.txt");
});

it("encodes directory and shared download links without confusing reserved characters", async () => {
	const { directoryUrl, sharedDownloadUrl } = await import(
		"../utils/directory-links"
	);
	const relative = "资料/中文 #?%.txt";
	expect(directoryUrl("/", "")).toBe("/");
	const directory = new URL(directoryUrl("/", relative), "http://localhost");
	expect(directory.searchParams.get("path")).toBe(relative);
	const download = new URL(
		sharedDownloadUrl("abc", relative),
		"http://localhost",
	);
	expect(download.pathname).toBe("/s/abc/download");
	expect(download.searchParams.get("path")).toBe(relative);
});
