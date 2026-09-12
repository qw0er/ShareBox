import CloudUploadOutlined from "@mui/icons-material/CloudUploadOutlined";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { useRef, useState } from "react";

export default function UploadDropzone({
	busy,
	onSelect,
}: {
	busy: boolean;
	onSelect: (file: File | null) => void;
}) {
	const input = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);
	const [selectionError, setSelectionError] = useState("");
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
					if (event.dataTransfer.files.length !== 1) {
						setSelectionError("请每次选择一个文件。");
						return;
					}
					setSelectionError("");
					onSelect(event.dataTransfer.files[0]);
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
					或从设备中选择一个文件
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
					hidden
					aria-label="选择上传文件"
					disabled={busy}
					onChange={(event) => {
						setSelectionError("");
						onSelect(event.target.files?.[0] ?? null);
						event.target.value = "";
					}}
				/>
			</Box>
			{selectionError && <Alert severity="warning">{selectionError}</Alert>}
		</Stack>
	);
}
