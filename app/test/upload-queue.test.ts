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
	await queue.start(id, 100);
	clients[0].options.onProgress(2, 5);
	expect(queue.tasks[0].bytes).toBe(2);
	await queue.pause(id);
	expect(queue.tasks[0].status).toBe("paused");
	expect(clients[0].abort).toHaveBeenCalledWith();
	await queue.start(id, 100);
	expect(clients).toHaveLength(1);
	expect(clients[0].start).toHaveBeenCalledTimes(2);
});
it("does not report success until publication succeeds; failed publication can retry", async () => {
	await queue.start(queue.tasks[0].id, 100);
	clients[0].options.onAfterResponse(null, { getHeader: () => url });
	vi.mocked(fetch).mockResolvedValueOnce(
		Response.json({ error: "disk full" }, { status: 500 }),
	);
	clients[0].options.onSuccess();
	await vi.waitFor(() => expect(queue.tasks[0].status).toBe("error"));
	expect(onComplete).not.toHaveBeenCalled();
	expect(queue.tasks[0].transferred).toBe(true);
	vi.mocked(fetch).mockResolvedValueOnce(Response.json({ success: true }));
	await queue.publish(queue.tasks[0]);
	expect(queue.tasks[0].status).toBe("complete");
	expect(onComplete).toHaveBeenCalledTimes(1);
});
it("keeps a task when DELETE fails and removes it only after confirmed termination", async () => {
	const id = queue.tasks[0].id;
	await queue.start(id, 100);
	clients[0].options.onAfterResponse(null, { getHeader: () => url });
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
	clients[0].options.onAfterResponse(null, { getHeader: () => url });
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
