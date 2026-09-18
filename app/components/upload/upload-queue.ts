import { Upload } from "tus-js-client";

export type UploadStatus =
	| "ready"
	| "queued"
	| "uploading"
	| "pausing"
	| "paused"
	| "publishing"
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
	transferred?: boolean;
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
		try {
			const saved: UploadTask[] = JSON.parse(
				localStorage.getItem(STORAGE) || "[]",
			);
			this.tasks = saved
				.filter(
					(t) =>
						typeof t.id === "string" &&
						typeof t.name === "string" &&
						Number.isSafeInteger(t.size) &&
						t.size >= 0 &&
						(!t.url || this.validUrl(t.url)),
				)
				.slice(0, 100)
				.map((t) => ({ ...t, file: undefined, status: "paused" }));
		} catch {
			this.tasks = [];
		}
		this.emit();
	}
	private validUrl(url: string) {
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
		for (const task of this.tasks) {
			if (task.status === "ready" && task.file && task.size <= maxSize) {
				task.status = "queued";
				this.pending.add(task.id);
			}
		}
		this.emit();
	}
	private pump() {
		if (this.disposed) return;
		for (const id of this.pending) {
			if (
				this.tasks.filter((t) =>
					["uploading", "pausing", "publishing"].includes(t.status),
				).length >= 2
			)
				break;
			this.pending.delete(id);
			void this.start(id, this.maxSize);
		}
	}
	private update(task: UploadTask, changes: Partial<UploadTask>) {
		if (this.disposed || !this.tasks.includes(task)) return;
		Object.assign(task, changes);
		this.emit();
	}
	add(files: File[], maxSize: number) {
		for (const file of files) {
			const existing = this.tasks.find(
				(t) =>
					t.name === file.name &&
					t.size === file.size &&
					t.lastModified === file.lastModified &&
					t.status !== "complete",
			);
			if (existing) {
				existing.file = file;
				continue;
			}
			if (this.tasks.length >= 100) {
				this.emit();
				throw new Error("最多保留 100 个上传任务，请先移除已完成任务。");
			}
			this.tasks.push({
				id: crypto.randomUUID(),
				name: file.name,
				size: file.size,
				lastModified: file.lastModified,
				file,
				bytes: 0,
				status: file.size > maxSize ? "error" : "ready",
				error: file.size > maxSize ? "超过单文件大小限制。" : undefined,
			});
		}
		this.emit();
	}
	async start(id: string, maxSize: number) {
		const task = this.tasks.find((t) => t.id === id);
		if (
			!task?.file ||
			task.size > maxSize ||
			["uploading", "pausing", "publishing", "deleting", "complete"].includes(
				task.status,
			)
		)
			return;
		// Bound disk and network pressure. Remaining tasks can be started as slots free up.
		if (
			this.tasks.filter((t) =>
				["uploading", "pausing", "publishing"].includes(t.status),
			).length >= 2
		)
			return;
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
				onAfterResponse: (_request, response) => {
					const locationHeader = response.getHeader("Location");
					if (locationHeader) {
						const url = new URL(locationHeader, location.origin).href;
						if (!this.validUrl(url)) throw new Error("Invalid upload URL");
						this.update(task, { url });
					}
				},
				onProgress: (bytes) => {
					if (task.status === "uploading") this.update(task, { bytes });
				},
				onError: (error) => {
					if (task.status === "uploading")
						this.update(task, { status: "error", error: error.message });
				},
				onSuccess: () => {
					if (task.status === "uploading") {
						this.update(task, { transferred: true });
						void this.publish(task);
					}
				},
			});
			this.uploads.set(id, upload);
		}
		upload.start();
	}
	async publish(task: UploadTask) {
		if (
			this.disposed ||
			["publishing", "deleting", "complete"].includes(task.status)
		)
			return;
		const url = task.url || this.uploads.get(task.id)?.url;
		if (!url || !this.validUrl(url)) {
			this.update(task, { status: "error", error: "无法取得上传地址。" });
			return;
		}
		this.update(task, { status: "publishing", bytes: task.size, url });
		try {
			const response = await fetch(`${url}/complete`, { method: "POST" });
			const result = await response.json();
			if (!response.ok || !result.success)
				throw new Error(result.error || "发布失败，请重试。");
			this.update(task, { status: "complete", error: undefined });
			this.uploads.delete(task.id);
			this.onComplete();
		} catch (error) {
			this.update(task, { status: "error", error: (error as Error).message });
		}
	}
	async pause(id: string) {
		const task = this.tasks.find((t) => t.id === id);
		if (task?.status === "queued") {
			this.pending.delete(id);
			this.update(task, { status: "paused" });
			return;
		}
		if (!task || task.status !== "uploading") return;
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
		if (!task || ["pausing", "publishing", "deleting"].includes(task.status))
			return;
		const complete = task.status === "complete";
		this.pending.delete(id);
		this.update(task, { status: "deleting", error: undefined });
		try {
			const upload = this.uploads.get(id);
			await upload?.abort();
			const url = task.url || upload?.url;
			if (url && !complete) {
				if (!this.validUrl(url)) throw new Error("Invalid upload URL");
				const response = await fetch(url, {
					method: "DELETE",
					headers: { "Tus-Resumable": "1.0.0" },
				});
				if (!response.ok && response.status !== 404 && response.status !== 410)
					throw new Error("删除上传失败，请重试。");
			}
			this.uploads.delete(id);
			this.tasks = this.tasks.filter((t) => t.id !== id);
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
