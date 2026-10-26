import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/logger.server", () => {
	const logger = {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		child: vi.fn(),
	};
	logger.child.mockReturnValue(logger);
	return { logger };
});

import { downloadRequestedFile } from "../server/files/delivery.server";

const FILES = "资料";
const NAME = "中文 #?%.txt";
const CONTENT = "0123456789";

let root: string;

beforeEach(async () => {
	root = await mkdtemp(path.join(os.tmpdir(), "sharebox-download-"));
	await mkdir(path.join(root, FILES));
	await writeFile(path.join(root, FILES, NAME), CONTENT);
	await writeFile(path.join(root, "empty.txt"), "");
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

function request(
	file = `${FILES}/${NAME}`,
	headers: HeadersInit = {},
	method = "GET",
) {
	const query = `?${new URLSearchParams({ path: file })}`;
	return new Request(`http://localhost/download${query}`, {
		headers,
		method,
	});
}

describe("private file download", () => {
	it("downloads a file with safe headers", async () => {
		const response = await downloadRequestedFile(root, request());
		expect(response.status).toBe(200);
		expect(await response.text()).toBe(CONTENT);
		expect(response.headers.get("Content-Type")).toBe(
			"application/octet-stream",
		);
		expect(response.headers.get("Content-Length")).toBe("10");
		expect(response.headers.get("Accept-Ranges")).toBe("bytes");
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		const disposition = response.headers.get("Content-Disposition") ?? "";
		expect(disposition).toContain("attachment;");
		const encoded = disposition.split("UTF-8''")[1] ?? "";
		expect(decodeURIComponent(encoded)).toBe(NAME);
	});

	it("serves single byte ranges", async () => {
		const partial = await downloadRequestedFile(
			root,
			request(undefined, { Range: "bytes=2-4" }),
		);
		expect(partial.status).toBe(206);
		expect(partial.headers.get("Content-Range")).toBe("bytes 2-4/10");
		expect(await partial.text()).toBe("234");

		const open = await downloadRequestedFile(
			root,
			request(undefined, { Range: "bytes=7-" }),
		);
		expect(await open.text()).toBe("789");

		const suffix = await downloadRequestedFile(
			root,
			request(undefined, { Range: "bytes=-3" }),
		);
		expect(await suffix.text()).toBe("789");
	});

	it("ignores multiple ranges and rejects unsatisfiable ranges", async () => {
		const multiple = await downloadRequestedFile(
			root,
			request(undefined, { Range: "bytes=0-1,3-4" }),
		);
		expect(multiple.status).toBe(200);
		expect(await multiple.text()).toBe(CONTENT);

		const unsatisfiable = await downloadRequestedFile(
			root,
			request(undefined, { Range: "bytes=20-" }),
		).catch((error: Response) => error);
		expect(unsatisfiable.status).toBe(416);
		expect(unsatisfiable.headers.get("Content-Range")).toBe("bytes */10");
	});

	it("honours If-Range only when the date still matches", async () => {
		const head = await downloadRequestedFile(
			root,
			request(undefined, {}, "HEAD"),
		);
		const lastModified = head.headers.get("Last-Modified");
		expect(lastModified).toBeTruthy();

		const matching = await downloadRequestedFile(
			root,
			request(undefined, {
				Range: "bytes=0-1",
				"If-Range": lastModified ?? "",
			}),
		);
		expect(matching.status).toBe(206);

		const stale = await downloadRequestedFile(
			root,
			request(undefined, {
				Range: "bytes=0-1",
				"If-Range": "Thu, 01 Jan 1970 00:00:00 GMT",
			}),
		);
		expect(stale.status).toBe(200);
		expect(await stale.text()).toBe(CONTENT);
	});

	it("handles HEAD and empty files without a body", async () => {
		const head = await downloadRequestedFile(
			root,
			request(undefined, {}, "HEAD"),
		);
		expect(head.status).toBe(200);
		expect(head.headers.get("Content-Length")).toBe("10");
		expect(await head.text()).toBe("");

		const empty = await downloadRequestedFile(root, request("empty.txt"));
		expect(empty.status).toBe(200);
		expect(empty.headers.get("Content-Length")).toBe("0");
		expect(await empty.text()).toBe("");
	});

	it.each([
		"../private",
		"/tmp/private",
		"C:/private",
		`${FILES}/../empty.txt`,
		`${FILES}//nested`,
		`${FILES}\\nested`,
		"bad\0name",
	])("rejects invalid path %j", async (value) => {
		await expect(
			downloadRequestedFile(root, request(value)),
		).rejects.toMatchObject({ status: 400 });
	});

	it("rejects missing files, directories and empty paths", async () => {
		await expect(
			downloadRequestedFile(root, request("missing.txt")),
		).rejects.toMatchObject({ status: 404 });
		await expect(
			downloadRequestedFile(root, request(FILES)),
		).rejects.toMatchObject({ status: 404 });
		await expect(
			downloadRequestedFile(root, request("")),
		).rejects.toMatchObject({ status: 400 });
	});

	it("does not follow symbolic links", async () => {
		await symlink(path.join(root, FILES, NAME), path.join(root, "link.txt"));
		await symlink(path.join(root, FILES), path.join(root, "alias"));

		await expect(
			downloadRequestedFile(root, request("link.txt")),
		).rejects.toMatchObject({ status: 404 });
		await expect(
			downloadRequestedFile(root, request(`alias/${NAME}`)),
		).rejects.toMatchObject({ status: 404 });
	});
});
