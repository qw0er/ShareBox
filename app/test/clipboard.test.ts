import { expect, it } from "vitest";
import { filesFromClipboard } from "../components/upload/clipboard";

function clipboard(text: string, files: File[] = []) {
	return { files: files as unknown as FileList, getData: () => text };
}

it("turns pasted text into a UTF-8 file using its first 20 characters", async () => {
	const text =
		"Hello 😀世界, this is longer than twenty characters\nSecond line";
	const [file] = filesFromClipboard(clipboard(text));
	expect(file.name).toBe(`${Array.from(text).slice(0, 20).join("")}.txt`);
	expect(file.type).toBe("text/plain;charset=utf-8");
	expect(await file.text()).toBe(text);
});

it("makes unsafe filename characters safe without altering the file content", async () => {
	const text = '/a\\b:\n<hi>?*|"';
	const [file] = filesFromClipboard(clipboard(text));
	expect(file.name).toBe("_a_b___hi_____.txt");
	expect(await file.text()).toBe(text);
	expect(filesFromClipboard(clipboard("   "))[0].name).toBe("pasted-text.txt");
});

it("prefers pasted files over text and ignores an empty clipboard", () => {
	const file = new File(["content"], "original.txt");
	expect(filesFromClipboard(clipboard("path", [file]))).toEqual([file]);
	expect(filesFromClipboard(clipboard(""))).toEqual([]);
});
