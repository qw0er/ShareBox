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
