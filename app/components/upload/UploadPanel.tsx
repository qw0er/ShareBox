import {
	Alert,
	Box,
	Button,
	LinearProgress,
	Paper,
	Stack,
	Typography,
} from "@mui/material";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRevalidator } from "react-router";
import { formatSize } from "~/utils/file-format";
import UploadDropzone from "./UploadDropzone";
import { UploadQueue, type UploadStatus } from "./upload-queue";

const labels: Record<UploadStatus, string> = {
	ready: "等待上传",
	queued: "排队中",
	uploading: "上传中",
	pausing: "正在暂停",
	paused: "已暂停",
	publishing: "正在发布",
	error: "失败",
	complete: "上传成功",
	deleting: "正在删除",
};

export default function UploadPanel({
	maxUploadBytes,
}: {
	maxUploadBytes: number;
}) {
	const revalidator = useRevalidator();
	const refresh = useRef(() => {
		void revalidator.revalidate();
	});
	refresh.current = () => {
		void revalidator.revalidate();
	};
	const [queue] = useState(() => new UploadQueue(() => refresh.current()));
	const tasks = useSyncExternalStore(
		queue.subscribe,
		queue.getSnapshot,
		queue.getSnapshot,
	);
	const [error, setError] = useState("");
	useEffect(() => {
		queue.restore();
		return () => queue.dispose();
	}, [queue]);
	const busy =
		tasks.filter((t) =>
			["uploading", "pausing", "publishing"].includes(t.status),
		).length >= 2;
	return (
		<Paper
			component="section"
			variant="outlined"
			sx={{ p: 3 }}
			aria-labelledby="upload-title"
		>
			<Stack spacing={2.5}>
				<Typography id="upload-title" variant="h6" component="h2">
					上传文件
				</Typography>
				<UploadDropzone
					busy={false}
					onSelect={(files) => {
						try {
							queue.add(files, maxUploadBytes);
							setError("");
						} catch (err) {
							setError((err as Error).message);
						}
					}}
				/>
				{error && <Alert severity="error">{error}</Alert>}
				<Button
					variant="contained"
					disabled={!tasks.some((t) => t.status === "ready" && t.file)}
					onClick={() => queue.startAll(maxUploadBytes)}
				>
					开始全部上传
				</Button>
				{tasks.map((task) => {
					const progress = task.size
						? Math.min(100, (task.bytes / task.size) * 100)
						: task.status === "complete"
							? 100
							: 0;
					return (
						<Box key={task.id} sx={{ minWidth: 0 }}>
							<Typography sx={{ overflowWrap: "anywhere" }}>
								{task.name}
							</Typography>
							<Typography variant="caption" role="status">
								{labels[task.status]} · {formatSize(task.bytes)} /{" "}
								{formatSize(task.size)} · {progress.toFixed(1)}%
							</Typography>
							<LinearProgress
								aria-label={`${task.name} 上传进度`}
								variant={
									task.status === "publishing" ? "indeterminate" : "determinate"
								}
								value={progress}
								sx={{ my: 1 }}
							/>
							{task.error && (
								<Alert
									severity="error"
									sx={{ overflowWrap: "anywhere", mb: 1 }}
								>
									{task.error}
								</Alert>
							)}
							{!task.file && task.status !== "complete" && (
								<Typography variant="caption">
									重新选择同一个文件后可继续，也可直接删除此上传。
								</Typography>
							)}
							<Stack direction="row" spacing={1}>
								{["uploading", "queued"].includes(task.status) ? (
									<Button onClick={() => void queue.pause(task.id)}>
										暂停
									</Button>
								) : (
									!["complete", "pausing", "publishing", "deleting"].includes(
										task.status,
									) && (
										<Button
											disabled={
												busy ||
												task.size > maxUploadBytes ||
												(!task.file && !task.transferred)
											}
											onClick={() => {
												if (task.url && task.transferred)
													void queue.publish(task);
												else void queue.start(task.id, maxUploadBytes);
											}}
										>
											{task.status === "ready" ? "开始上传" : "继续 / 重试"}
										</Button>
									)
								)}
								<Button
									color="error"
									disabled={["pausing", "publishing", "deleting"].includes(
										task.status,
									)}
									onClick={() => void queue.remove(task.id)}
								>
									{task.status === "complete" ? "移除记录" : "删除上传"}
								</Button>
							</Stack>
						</Box>
					);
				})}
				<Typography variant="caption" color="text.secondary">
					每个文件最多 {formatSize(maxUploadBytes)}，同时传输最多 2
					个。暂停保留进度；删除上传会清理临时数据。刷新后重新选择原文件可续传。任务保留
					7 天。
				</Typography>
			</Stack>
		</Paper>
	);
}
