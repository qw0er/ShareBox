import { privateDownloadUrl } from "~/utils/download-links";

export const MAX_COPY_TEXT_BYTES = 1024 * 1024;
const TEXT_EXTENSION =
	/\.(?:txt|md|markdown|log|csv|tsv|json|jsonl|xml|ya?ml|toml|ini|conf|html?|css|js|jsx|ts|tsx|sh|py|sql|svg)$/i;

export function isTextFile(name: string) {
	return TEXT_EXTENSION.test(name);
}

export class TextFileTooLarge extends Error {}

export async function readTextFile(path: string): Promise<string> {
	const response = await fetch(privateDownloadUrl(path), { redirect: "error" });
	if (!response.ok || !response.body) throw new Error("Unable to read file");
	const length = response.headers.get("Content-Length");
	if (length !== null && Number(length) > MAX_COPY_TEXT_BYTES) {
		await response.body.cancel();
		throw new TextFileTooLarge();
	}
	const reader = response.body.getReader();
	const decoder = new TextDecoder("utf-8", { fatal: true });
	let text = "";
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > MAX_COPY_TEXT_BYTES) throw new TextFileTooLarge();
			text += decoder.decode(value, { stream: true });
		}
		return text + decoder.decode();
	} catch (error) {
		await reader.cancel().catch(() => {});
		throw error;
	} finally {
		reader.releaseLock();
	}
}
