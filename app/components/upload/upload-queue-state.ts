import type { UploadStatus, UploadTask } from "./upload-queue";

export const MAX_TASKS = 100;
export const MAX_CONCURRENT = 2;
export const ACTIVE_STATUSES: UploadStatus[] = ["uploading", "pausing"];

export function updateTask(
	tasks: UploadTask[],
	id: string,
	changes: Partial<UploadTask>,
): UploadTask[] {
	return tasks.map((task) => (task.id === id ? { ...task, ...changes } : task));
}

export function removeTask(tasks: UploadTask[], id: string): UploadTask[] {
	return tasks.filter((task) => task.id !== id);
}

export function activeCount(tasks: UploadTask[]): number {
	return tasks.filter((task) => ACTIVE_STATUSES.includes(task.status)).length;
}

export function queueReadyTasks(tasks: UploadTask[], maxSize: number) {
	const queuedIds = tasks
		.filter(
			(task) => task.status === "ready" && task.file && task.size <= maxSize,
		)
		.map((task) => task.id);
	return {
		tasks: tasks.map<UploadTask>((task) =>
			queuedIds.includes(task.id) ? { ...task, status: "queued" } : task,
		),
		queuedIds,
	};
}

export function addFiles(
	tasks: UploadTask[],
	files: File[],
	maxSize: number,
	createId: () => string,
): UploadTask[] {
	let next = tasks;
	for (const file of files) {
		const existing = next.find(
			(task) =>
				task.name === file.name &&
				task.size === file.size &&
				task.lastModified === file.lastModified &&
				task.status !== "complete",
		);
		if (existing) {
			next = updateTask(next, existing.id, { file });
			continue;
		}
		if (next.length >= MAX_TASKS)
			throw new Error("最多保留 100 个上传任务，请先移除已完成任务。");
		const oversized = file.size > maxSize;
		next = [
			...next,
			{
				id: createId(),
				name: file.name,
				size: file.size,
				lastModified: file.lastModified,
				file,
				bytes: 0,
				status: oversized ? "error" : "ready",
				error: oversized ? "超过单文件大小限制。" : undefined,
			},
		];
	}
	return next;
}

export function parseStoredTasks(
	value: string | null,
	isValidUrl: (url: string) => boolean,
) {
	try {
		const saved: (UploadTask & { transferred?: boolean })[] = JSON.parse(
			value || "[]",
		);
		if (!Array.isArray(saved)) return [];
		return saved
			.filter(
				(task) =>
					typeof task.id === "string" &&
					typeof task.name === "string" &&
					Number.isSafeInteger(task.size) &&
					task.size >= 0 &&
					(!task.url || isValidUrl(task.url)),
			)
			.slice(0, MAX_TASKS)
			.map(({ transferred: _legacyTransferred, ...task }) => ({
				...task,
				file: undefined,
				status: "paused" as const,
			}));
	} catch {
		return [];
	}
}
