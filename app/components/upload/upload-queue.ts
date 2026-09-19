import { Upload } from "tus-js-client";
import {
	activeCount,
	addFiles,
	MAX_CONCURRENT,
	parseStoredTasks,
	queueReadyTasks,
	removeTask,
	updateTask,
} from "./upload-queue-state";

export type UploadStatus =
	| "ready"
	| "queued"
	| "uploading"
	| "pausing"
	| "paused"
	| "error"
	| "complete"
	| "deleting";
export type UploadTask = {
	id: string;
	name: string;
	size: number;
	lastModified: number;
	bytes: number;
	status: UploadStatus;
	url?: string;
	error?: string;
	file?: File;
};
const STORAGE = "sharebox.uploads.v1";
const CHUNK_SIZE = 8 * 1024 * 1024;

/** Client-side queue; tus owns offset reconciliation and transport retries. */
export class UploadQueue {
	tasks: UploadTask[] = [];
	private uploads = new Map<string, Upload>();
	private listeners = new Set<() => void>();
	private disposed = false;
	private pending = new Set<string>();
	private maxSize = 0;
	constructor(private onComplete: () => void) {}
	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};
	getSnapshot = () => this.tasks;
	restore() {
		this.disposed = false;
		this.tasks = parseStoredTasks(localStorage.getItem(STORAGE), (url) =>
			validUrl(url),
		);
		this.emit();
	}
	private emit() {
		this.tasks = [...this.tasks];
		localStorage.setItem(
			STORAGE,
			JSON.stringify(
				this.tasks
					.filter((t) => t.status !== "complete")
					.map(({ file, ...task }) => task),
			),
		);
		for (const listener of this.listeners) listener();
		queueMicrotask(() => this.pump());
	}
	startAll(maxSize: number) {
		this.maxSize = maxSize;
		const queued = queueReadyTasks(this.tasks, maxSize);
		this.tasks = queued.tasks;
		for (const id of queued.queuedIds) this.pending.add(id);
		this.emit();
	}
	private pump() {
		if (this.disposed) return;
		for (const id of this.pending) {
			if (activeCount(this.tasks) >= MAX_CONCURRENT) break;
			this.pending.delete(id);
			void this.start(id, this.maxSize);
		}
	}
	private update(task: UploadTask, changes: Partial<UploadTask>) {
		if (this.disposed || !this.tasks.some(({ id }) => id === task.id)) return;
		this.tasks = updateTask(this.tasks, task.id, changes);
		this.emit();
	}
	private statusOf(id: string) {
		return this.tasks.find((task) => task.id === id)?.status;
	}
	add(files: File[], maxSize: number) {
		this.tasks = addFiles(this.tasks, files, maxSize, () =>
			crypto.randomUUID(),
		);
		this.emit();
	}
	async start(id: string, maxSize: number) {
		const task = this.tasks.find((t) => t.id === id);
		if (
			!task?.file ||
			task.size > maxSize ||
			["uploading", "pausing", "deleting", "complete"].includes(task.status)
		)
			return;
		// Bound disk and network pressure. Remaining tasks can be started as slots free up.
		if (activeCount(this.tasks) >= MAX_CONCURRENT) return;
		this.update(task, { status: "uploading", error: undefined });
		let upload = this.uploads.get(id);
		if (!upload) {
			upload = new Upload(task.file, {
				endpoint: "/uploads",
				uploadUrl: task.url,
				chunkSize: CHUNK_SIZE,
				retryDelays: [0, 1000, 3000, 5000, 10000],
				// The queue persists URLs together with visible task records.
				storeFingerprintForResuming: false,
				metadata: { filename: task.name },
				onAfterResponse: (request, response) => {
					// tus-js-client otherwise creates a new upload after a failed HEAD.
					// Keep the URL and accepted bytes when completion is temporarily failing.
					const status = response.getStatus();
					if (
						request.getMethod() === "HEAD" &&
						status >= 400 &&
						status !== 404 &&
						status !== 410
					) {
						throw new Error(`无法确认上传完成（HTTP ${status}），请重试。`);
					}
					const locationHeader = response.getHeader("Location");
					if (locationHeader) {
						const url = new URL(locationHeader, location.origin).href;
						if (!validUrl(url)) throw new Error("Invalid upload URL");
						this.update(task, { url });
					}
				},
				onProgress: (bytes) => {
					if (this.statusOf(id) === "uploading") this.update(task, { bytes });
				},
				onError: (error) => {
					if (this.statusOf(id) === "uploading")
						this.update(task, { status: "error", error: error.message });
				},
				onSuccess: () => {
					if (!this.disposed && this.statusOf(id) === "uploading") {
						this.update(task, {
							status: "complete",
							bytes: task.size,
							error: undefined,
						});
						this.uploads.delete(id);
						this.onComplete();
					}
				},
			});
			this.uploads.set(id, upload);
		}
		upload.start();
	}
	async pause(id: string) {
		const task = this.tasks.find((t) => t.id === id);
		if (task?.status === "queued") {
			this.pending.delete(id);
			this.update(task, { status: "paused" });
			return;
		}
		if (task?.status !== "uploading") return;
		this.update(task, { status: "pausing" });
		try {
			await this.uploads.get(id)?.abort();
			this.update(task, { status: "paused" });
		} catch (error) {
			this.update(task, { status: "error", error: (error as Error).message });
		}
	}
	async remove(id: string) {
		const task = this.tasks.find((t) => t.id === id);
		if (!task || ["pausing", "deleting"].includes(task.status)) return;
		const complete = task.status === "complete";
		this.pending.delete(id);
		this.update(task, { status: "deleting", error: undefined });
		try {
			const upload = this.uploads.get(id);
			await upload?.abort();
			const url = task.url || upload?.url;
			if (url && !complete) {
				if (!validUrl(url)) throw new Error("Invalid upload URL");
				const response = await fetch(url, {
					method: "DELETE",
					headers: { "Tus-Resumable": "1.0.0" },
				});
				if (!response.ok && response.status !== 404 && response.status !== 410)
					throw new Error("删除上传失败，请重试。");
			}
			this.uploads.delete(id);
			this.tasks = removeTask(this.tasks, id);
			this.emit();
		} catch (error) {
			this.update(task, { status: "error", error: (error as Error).message });
		}
	}
	dispose() {
		this.disposed = true;
		this.pending.clear();
		for (const upload of this.uploads.values()) void upload.abort();
		this.uploads.clear();
	}
}
function validUrl(url: string) {
	try {
		const parsed = new URL(url, location.origin);
		return (
			parsed.origin === location.origin &&
			/^\/uploads\/[a-f0-9]{32}$/.test(parsed.pathname) &&
			!parsed.search &&
			!parsed.hash
		);
	} catch {
		return false;
	}
}
