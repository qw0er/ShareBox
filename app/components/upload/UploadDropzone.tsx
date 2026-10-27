import CloudUploadOutlined from "@mui/icons-material/CloudUploadOutlined";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { useRef, useState } from "react";
import { useTranslation } from "~/i18n";

export default function UploadDropzone({
	busy,
	onSelect,
}: {
	busy: boolean;
	onSelect: (files: File[]) => void;
}) {
	const t = useTranslation();
	const input = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);
	const [pasteError, setPasteError] = useState(false);
	return (
		<Stack spacing={2}>
			<Box
				role="group"
				tabIndex={busy ? -1 : 0}
				aria-label={t("文件上传区域")}
				onPaste={(event) => {
					event.preventDefault();
					if (busy) return;
					const files = Array.from(event.clipboardData.files);
					if (!files.length) {
						setPasteError(true);
						return;
					}
					setPasteError(false);
					onSelect(files);
				}}
				onDragOver={(event) => {
					event.preventDefault();
					if (!busy) setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={(event) => {
					event.preventDefault();
					setDragging(false);
					if (busy) return;
					setPasteError(false);
					onSelect(Array.from(event.dataTransfer.files));
				}}
				sx={{
					border: "1.5px dashed",
					borderColor: dragging ? "primary.main" : "divider",
					borderRadius: 2,
					bgcolor: dragging ? "action.selected" : "action.hover",
					p: 3,
					textAlign: "center",
					"&:focus-visible": {
						outline: "2px solid",
						outlineColor: "primary.main",
						outlineOffset: 2,
					},
				}}
			>
				<CloudUploadOutlined
					sx={{ fontSize: 40, color: "primary.main", mb: 1.5 }}
				/>
				<Typography variant="body2" sx={{ fontWeight: 600 }}>
					{t("将文件拖放到这里")}
				</Typography>
				<Typography
					variant="caption"
					color="text.secondary"
					sx={{ my: 1, display: "block" }}
				>
					{t("选择文件，或在此区域粘贴复制的文件。")}
				</Typography>
				{pasteError && (
					<Alert severity="info" sx={{ mb: 2, textAlign: "left" }}>
						{t(
							"剪贴板没有可上传的文件。文件路径无法直接上传，请选择或拖放文件。",
						)}
					</Alert>
				)}
				<Button
					variant="outlined"
					disabled={busy}
					onClick={() => input.current?.click()}
				>
					{t("选择文件")}
				</Button>
				<input
					ref={input}
					type="file"
					multiple
					hidden
					aria-label={t("选择上传文件")}
					disabled={busy}
					onChange={(event) => {
						setPasteError(false);
						onSelect(Array.from(event.target.files ?? []));
						event.target.value = "";
					}}
				/>
			</Box>
		</Stack>
	);
}
