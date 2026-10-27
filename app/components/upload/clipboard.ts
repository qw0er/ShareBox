/** Prefer actual files when the clipboard also includes a textual representation. */
export function filesFromClipboard(
	clipboard: Pick<DataTransfer, "files" | "getData">,
): File[] {
	const files = Array.from(clipboard.files);
	if (files.length) return files;
	const text = clipboard.getData("text/plain");
	if (!text) return [];
	const prefix = Array.from(text).slice(0, 20).join("");
	const name = prefix
		// biome-ignore lint/suspicious/noControlCharactersInRegex: Clipboard text may contain control characters unsafe in filenames.
		.replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, "_")
		.trim()
		.replace(/[. ]+$/g, "");
	return [
		new File([text], `${name || "pasted-text"}.txt`, {
			type: "text/plain;charset=utf-8",
		}),
	];
}
