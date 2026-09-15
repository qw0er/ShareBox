import CloudUploadOutlined from "@mui/icons-material/CloudUploadOutlined";
import { Box, Button, Stack, Typography } from "@mui/material";
import { useRef, useState } from "react";

export default function UploadDropzone({
	busy,
	onSelect,
}: {
	busy: boolean;
	onSelect: (files: File[]) => void;
}) {
	const input = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);
	return (
		<Stack spacing={2}>
			<Box
				onDragOver={(event) => {
					event.preventDefault();
					if (!busy) setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={(event) => {
					event.preventDefault();
					setDragging(false);
					if (busy) return;
					onSelect(Array.from(event.dataTransfer.files));
				}}
				sx={{
					border: "1.5px dashed",
					borderColor: dragging ? "primary.main" : "#bdcdbf",
					borderRadius: 2,
					bgcolor: dragging ? "#e3ede4" : "#f7faf7",
					p: 3,
					textAlign: "center",
				}}
			>
				<CloudUploadOutlined
					sx={{ fontSize: 40, color: "primary.main", mb: 1.5 }}
				/>
				<Typography variant="body2" sx={{ fontWeight: 600 }}>
					将文件拖放到这里
				</Typography>
				<Typography
					variant="caption"
					color="text.secondary"
					sx={{ my: 1, display: "block" }}
				>
					或从设备中选择多个文件
				</Typography>
				<Button
					variant="outlined"
					disabled={busy}
					onClick={() => input.current?.click()}
				>
					选择文件
				</Button>
				<input
					ref={input}
					type="file"
					multiple
					hidden
					aria-label="选择上传文件"
					disabled={busy}
					onChange={(event) => {
						onSelect(Array.from(event.target.files ?? []));
						event.target.value = "";
					}}
				/>
			</Box>
		</Stack>
	);
}
