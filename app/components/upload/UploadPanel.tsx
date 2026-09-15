import ArrowUpward from "@mui/icons-material/ArrowUpward";
import InsertDriveFileOutlined from "@mui/icons-material/InsertDriveFileOutlined";
import {
	Alert,
	Box,
	Button,
	LinearProgress,
	Paper,
	Stack,
	Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import type { action } from "~/routes/home";
import { MAX_UPLOAD_FILES } from "~/types/files";
import { formatSize } from "~/utils/file-format";
import UploadDropzone from "./UploadDropzone";

export default function UploadPanel({
	maxUploadBytes,
}: {
	maxUploadBytes: number;
}) {
	const fetcher = useFetcher<typeof action>();
	const [files, setFiles] = useState<File[]>([]);
	const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
	const selectionError =
		files.length > MAX_UPLOAD_FILES
			? `每批最多 ${MAX_UPLOAD_FILES} 个文件。`
			: files.some((file) => file.size > maxUploadBytes)
				? "所选文件中有文件超出单文件大小限制。"
				: "";
	const busy = fetcher.state !== "idle";
	useEffect(() => {
		if (fetcher.state === "idle" && fetcher.data?.results) {
			setFiles((current) =>
				current.filter((_, index) => fetcher.data?.results?.[index]?.error),
			);
		} else if (fetcher.state === "idle" && fetcher.data?.success) {
			setFiles([]);
		}
	}, [fetcher.state, fetcher.data]);
	return (
		<Paper
			component="section"
			variant="outlined"
			sx={{ p: 3 }}
			aria-labelledby="upload-title"
		>
			<Stack spacing={2.5}>
				<Box>
					<Typography id="upload-title" variant="h6" component="h2">
						上传文件
					</Typography>
					<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
						添加文件到根目录
					</Typography>
				</Box>
				<UploadDropzone busy={busy} onSelect={setFiles} />
				{files.map((file, index) => (
					<Stack
						key={index}
						direction="row"
						spacing={1.5}
						sx={{ minWidth: 0, alignItems: "center" }}
					>
						<InsertDriveFileOutlined color="primary" />
						<Box sx={{ minWidth: 0 }}>
							<Typography
								variant="body2"
								sx={{ overflowWrap: "anywhere", fontWeight: 500 }}
							>
								{file.name}
							</Typography>
							<Typography variant="caption" color="text.secondary">
								{formatSize(file.size)}
							</Typography>
						</Box>
					</Stack>
				))}
				<Typography variant="body2">
					已选择 {files.length} 个文件，共 {formatSize(totalBytes)}
				</Typography>
				{selectionError && <Alert severity="warning">{selectionError}</Alert>}
				{busy && (
					<Box role="status">
						<LinearProgress />
						<Typography variant="caption" color="text.secondary">
							正在上传并刷新文件列表…
						</Typography>
					</Box>
				)}
				{!busy && fetcher.data?.error && (
					<Alert severity="error">{fetcher.data.error}</Alert>
				)}
				{!busy && fetcher.data?.success && files.length === 0 && (
					<Alert severity="success">文件上传成功，列表已更新。</Alert>
				)}
				{!busy &&
					fetcher.data?.results?.map((result, index) => (
						<Alert
							key={index}
							severity={result.error ? "error" : "success"}
							sx={{ overflowWrap: "anywhere" }}
						>
							{result.filename}：{result.error ?? "上传成功"}
						</Alert>
					))}
				<Button
					fullWidth
					size="large"
					variant="contained"
					startIcon={<ArrowUpward />}
					disabled={!files.length || !!selectionError || busy}
					onClick={() => {
						if (!files.length || selectionError || busy) return;
						const data = new FormData();
						data.set("intent", "upload");
						for (const file of files) data.append("file", file);
						fetcher.submit(data, {
							method: "post",
							encType: "multipart/form-data",
						});
					}}
				>
					{busy ? "上传中…" : "上传文件"}
				</Button>
				<Typography variant="caption" color="text.secondary">
					每批最多 {MAX_UPLOAD_FILES} 个文件，每个文件不超过{" "}
					{formatSize(maxUploadBytes)}
					。同名文件会被拒绝，不覆盖已有内容。
				</Typography>
			</Stack>
		</Paper>
	);
}
