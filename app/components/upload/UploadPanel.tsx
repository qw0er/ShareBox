import {
	Alert,
	Box,
	Button,
	LinearProgress,
	Paper,
	Stack,
	Typography,
} from "@mui/material";
import {
	type RefObject,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useRevalidator } from "react-router";
import { useTranslation } from "~/i18n";
import { formatSize } from "~/utils/file-format";
import UploadDropzone from "./UploadDropzone";
import { UploadQueue, type UploadStatus } from "./upload-queue";

const labels: Record<UploadStatus, string> = {
	ready: "等待上传",
	queued: "排队中",
	uploading: "上传中",
	pausing: "正在暂停",
	paused: "已暂停",
	error: "失败",
	complete: "上传成功",
	deleting: "正在删除",
};

export default function UploadPanel({
	maxUploadBytes,
	fileInputRef,
	directory = "",
}: {
	maxUploadBytes: number;
	directory?: string;
	fileInputRef?: RefObject<HTMLInputElement | null>;
}) {
	const t = useTranslation();
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
		tasks.filter((t) => ["uploading", "pausing"].includes(t.status)).length >=
		2;
	return (
		<Paper
			component="section"
			variant="outlined"
			sx={{ p: 3 }}
			aria-labelledby="upload-title"
		>
			<Stack spacing={2.5}>
				<Typography id="upload-title" variant="h6" component="h2">
					{t("上传文件")}
				</Typography>
				<Typography
					variant="body2"
					color="text.secondary"
					sx={{ overflowWrap: "anywhere" }}
				>
					{t("上传到：{path}").replace("{path}", directory || t("全部文件"))}
				</Typography>
				<UploadDropzone
					busy={false}
					inputRef={fileInputRef}
					onSelect={(files) => {
						fileInputRef?.current
							?.closest("section")
							?.scrollIntoView({ behavior: "smooth", block: "start" });
						try {
							queue.add(files, maxUploadBytes, directory);
							setError("");
						} catch (err) {
							setError((err as Error).message);
						}
					}}
				/>
				{error && <Alert severity="error">{t(error)}</Alert>}
				<Button
					variant="contained"
					disabled={!tasks.some((t) => t.status === "ready" && t.file)}
					onClick={() => queue.startAll(maxUploadBytes)}
				>
					{t("开始全部上传")}
				</Button>
				{tasks.map((task) => {
					const finishing =
						task.status === "uploading" && task.bytes === task.size;
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
							<Typography
								variant="body2"
								color="text.secondary"
								sx={{ overflowWrap: "anywhere" }}
							>
								{t("目标目录：{path}").replace(
									"{path}",
									task.directory || t("全部文件"),
								)}
							</Typography>
							<Typography variant="caption" role="status">
								{finishing ? t("正在完成") : t(labels[task.status])} ·{" "}
								{formatSize(task.bytes)} / {formatSize(task.size)} ·{" "}
								{progress.toFixed(1)}%
							</Typography>
							<LinearProgress
								aria-label={`${task.name} ${t("上传进度")}`}
								variant={finishing ? "indeterminate" : "determinate"}
								value={progress}
								sx={{ my: 1 }}
							/>
							{task.error && (
								<Alert
									severity="error"
									sx={{ overflowWrap: "anywhere", mb: 1 }}
								>
									{t(task.error)}
								</Alert>
							)}
							{!task.file && task.status !== "complete" && (
								<Typography variant="caption">
									{t(
										"在目标目录重新选择同一个文件后可继续，也可直接删除此上传。",
									)}
								</Typography>
							)}
							<Stack direction="row" spacing={1}>
								{["uploading", "queued"].includes(task.status) ? (
									<Button onClick={() => void queue.pause(task.id)}>
										{t("暂停")}
									</Button>
								) : (
									!["complete", "pausing", "deleting"].includes(
										task.status,
									) && (
										<Button
											disabled={
												busy || task.size > maxUploadBytes || !task.file
											}
											onClick={() => {
												void queue.start(task.id, maxUploadBytes);
											}}
										>
											{task.status === "ready"
												? t("开始上传")
												: t("继续 / 重试")}
										</Button>
									)
								)}
								<Button
									color="error"
									disabled={["pausing", "deleting"].includes(task.status)}
									onClick={() => void queue.remove(task.id)}
								>
									{task.status === "complete" ? t("移除记录") : t("删除上传")}
								</Button>
							</Stack>
						</Box>
					);
				})}
				<Typography variant="caption" color="text.secondary">
					{t("上传说明 {size}").replace("{size}", formatSize(maxUploadBytes))}
				</Typography>
			</Stack>
		</Paper>
	);
}
