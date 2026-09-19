import { afterEach, beforeEach, expect, it, vi } from "vitest";

const clients = vi.hoisted(
	() =>
		[] as {
			options: Record<string, any>;
			start: ReturnType<typeof vi.fn>;
			abort: ReturnType<typeof vi.fn>;
			url: string | null;
		}[],
);
vi.mock("tus-js-client", () => ({
	Upload: class {
		options;
		start = vi.fn();
		abort = vi.fn(async () => {});
		url = null;
		constructor(_file: File, options: Record<string, any>) {
			this.options = options;
			clients.push(this);
		}
	},
}));

import { UploadQueue } from "../components/upload/upload-queue";

const url = "http://localhost/uploads/0123456789abcdef0123456789abcdef";
let queue: UploadQueue;
let onComplete: ReturnType<typeof vi.fn<() => void>>;
beforeEach(() => {
	clients.length = 0;
	const data = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		getItem: (k: string) => data.get(k),
		setItem: (k: string, v: string) => data.set(k, v),
	});
	vi.stubGlobal("location", { origin: "http://localhost" });
	vi.stubGlobal("fetch", vi.fn());
	onComplete = vi.fn();
	queue = new UploadQueue(onComplete);
	queue.add([new File(["hello"], "test.txt", { lastModified: 1 })], 100);
});
afterEach(() => {
	queue.dispose();
	vi.unstubAllGlobals();
});
it("shows progress and pauses without terminating, then resumes the same client", async () => {
	const id = queue.tasks[0].id;
	const beforeStart = queue.tasks;
	await queue.start(id, 100);
	expect(queue.tasks).not.toBe(beforeStart);
	expect(beforeStart[0].status).toBe("ready");
	clients[0].options.onProgress(2, 5);
	expect(queue.tasks[0].bytes).toBe(2);
	await queue.pause(id);
	expect(queue.tasks[0].status).toBe("paused");
	expect(clients[0].abort).toHaveBeenCalledWith();
	await queue.start(id, 100);
	expect(clients).toHaveLength(1);
	expect(clients[0].start).toHaveBeenCalledTimes(2);
});
it("waits for tus success after 100% progress and retries errors through tus", async () => {
	const id = queue.tasks[0].id;
	await queue.start(id, 100);
	clients[0].options.onAfterResponse(
		{ getMethod: () => "POST" },
		{ getHeader: () => url, getStatus: () => 201 },
	);
	clients[0].options.onProgress(5, 5);
	expect(queue.tasks[0].status).toBe("uploading");
	expect(onComplete).not.toHaveBeenCalled();
	clients[0].options.onError(new Error("disk full"));
	expect(queue.tasks[0].status).toBe("error");
	await queue.start(id, 100);
	expect(clients[0].start).toHaveBeenCalledTimes(2);
	clients[0].options.onSuccess();
	expect(queue.tasks[0]).toMatchObject({ status: "complete", bytes: 5 });
	expect(onComplete).toHaveBeenCalledTimes(1);
	expect(fetch).not.toHaveBeenCalled();
});
it("keeps a task when DELETE fails and removes it only after confirmed termination", async () => {
	const id = queue.tasks[0].id;
	await queue.start(id, 100);
	clients[0].options.onAfterResponse(
		{ getMethod: () => "POST" },
		{ getHeader: () => url, getStatus: () => 201 },
	);
	vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
	await queue.remove(id);
	expect(queue.tasks[0].status).toBe("error");
	vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
	await queue.remove(id);
	expect(queue.tasks).toHaveLength(0);
	expect(fetch).toHaveBeenLastCalledWith(
		url,
		expect.objectContaining({ method: "DELETE" }),
	);
});
it("restores a paused task and resumes after reselecting its local file", async () => {
	await queue.start(queue.tasks[0].id, 100);
	clients[0].options.onAfterResponse(
		{ getMethod: () => "POST" },
		{ getHeader: () => url, getStatus: () => 201 },
	);
	queue.dispose();
	queue = new UploadQueue(onComplete);
	queue.restore();
	expect(queue.tasks[0]).toMatchObject({
		status: "paused",
		url,
		file: undefined,
	});
	queue.add([new File(["hello"], "test.txt", { lastModified: 1 })], 100);
	expect(queue.tasks).toHaveLength(1);
	await queue.start(queue.tasks[0].id, 100);
	expect(clients[1].options.uploadUrl).toBe(url);
});
it("limits concurrency and prevents starting while abort is settling", async () => {
	queue.add([new File(["x"], "2"), new File(["x"], "3")], 100);
	for (const task of queue.tasks) await queue.start(task.id, 100);
	expect(clients).toHaveLength(2);
	let done!: () => void;
	clients[0].abort.mockImplementationOnce(
		() =>
			new Promise<void>((resolve) => {
				done = resolve;
			}),
	);
	const pending = queue.pause(queue.tasks[0].id);
	await queue.start(queue.tasks[0].id, 100);
	expect(clients[0].start).toHaveBeenCalledTimes(1);
	done();
	await pending;
});

it("starts the next queued file when a transfer fails and allows pausing queued tasks", async () => {
	queue.add(
		[new File(["x"], "2"), new File(["x"], "3"), new File(["x"], "4")],
		100,
	);
	queue.startAll(100);
	await vi.waitFor(() => expect(clients).toHaveLength(2));
	expect(queue.tasks[2].status).toBe("queued");
	await queue.pause(queue.tasks[3].id);
	clients[0].options.onError(new Error("network failed"));
	await vi.waitFor(() => expect(clients).toHaveLength(3));
	expect(queue.tasks[2].status).toBe("uploading");
	expect(queue.tasks[3].status).toBe("paused");
});

it("restores legacy publication tasks as ordinary resumable uploads", async () => {
	localStorage.setItem(
		"sharebox.uploads.v1",
		JSON.stringify([
			{
				id: "legacy",
				name: "test.txt",
				size: 5,
				lastModified: 1,
				bytes: 5,
				status: "publishing",
				transferred: true,
				url,
			},
		]),
	);
	queue.restore();
	expect(queue.tasks[0]).toMatchObject({ status: "paused", url, bytes: 5 });
	expect(queue.tasks[0]).not.toHaveProperty("transferred");
	queue.add([new File(["hello"], "test.txt", { lastModified: 1 })], 100);
	await queue.start("legacy", 100);
	expect(clients[0].options.uploadUrl).toBe(url);
	clients[0].options.onSuccess();
	expect(queue.tasks[0].status).toBe("complete");
});

it("prevents tus from replacing an upload after a failed completion HEAD", async () => {
	await queue.start(queue.tasks[0].id, 100);
	const callback = clients[0].options.onAfterResponse;
	for (const status of [409, 423, 500]) {
		expect(() =>
			callback(
				{ getMethod: () => "HEAD" },
				{
					getStatus: () => status,
					getHeader: () => null,
				},
			),
		).toThrow("无法确认上传完成");
	}
	for (const status of [200, 404, 410]) {
		expect(() =>
			callback(
				{ getMethod: () => "HEAD" },
				{
					getStatus: () => status,
					getHeader: () => null,
				},
			),
		).not.toThrow();
	}
});

it("keeps the snapshot callback bound when React calls it independently", () => {
	const snapshot = queue.getSnapshot;
	expect(snapshot()).toBe(queue.tasks);
});

it("ignores a late success callback after disposal", async () => {
	await queue.start(queue.tasks[0].id, 100);
	queue.dispose();
	clients[0].options.onSuccess();
	expect(onComplete).not.toHaveBeenCalled();
	expect(queue.tasks[0].status).not.toBe("complete");
});
