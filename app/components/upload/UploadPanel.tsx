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
import { formatSize } from "~/utils/file-format";
import UploadDropzone from "./UploadDropzone";

export default function UploadPanel({
	maxUploadBytes,
}: {
	maxUploadBytes: number;
}) {
	const fetcher = useFetcher<typeof action>();
	const [file, setFile] = useState<File | null>(null);
	const busy = fetcher.state !== "idle";
	useEffect(() => {
		if (fetcher.state === "idle" && fetcher.data?.success) {
			setFile(null);
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
				<UploadDropzone busy={busy} onSelect={setFile} />
				{file && (
					<Stack
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
				)}
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
				{!busy && fetcher.data?.success && !file && (
					<Alert severity="success">文件上传成功，列表已更新。</Alert>
				)}
				<Button
					fullWidth
					size="large"
					variant="contained"
					startIcon={<ArrowUpward />}
					disabled={!file || busy}
					onClick={() => {
						if (!file || busy) return;
						const data = new FormData();
						data.set("intent", "upload");
						data.set("file", file);
						fetcher.submit(data, {
							method: "post",
							encType: "multipart/form-data",
						});
					}}
				>
					{busy ? "上传中…" : "上传文件"}
				</Button>
				<Typography variant="caption" color="text.secondary">
					每次上传一个文件，最大 {formatSize(maxUploadBytes)}
					。同名文件会被拒绝，不覆盖已有内容。
				</Typography>
			</Stack>
		</Paper>
	);
}
