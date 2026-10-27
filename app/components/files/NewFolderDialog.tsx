import {
	Alert,
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	TextField,
} from "@mui/material";
import { useEffect, useId, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslation } from "~/i18n";
import type { action } from "~/routes/files-mkdir";

export default function NewFolderDialog({
	path,
	onClose,
	onSuccess,
}: {
	path: string;
	onClose: () => void;
	onSuccess: () => void;
}) {
	const t = useTranslation();
	const id = useId();
	const fetcher = useFetcher<typeof action>();
	const busy = fetcher.state !== "idle";
	const [name, setName] = useState("");
	const invalid =
		!name.trim() || name === "." || name === ".." || /[\\/\0]/.test(name);
	useEffect(() => {
		if (!busy && fetcher.data?.success) onSuccess();
	}, [busy, fetcher.data, onSuccess]);
	return (
		<Dialog
			open
			maxWidth="xs"
			fullWidth
			aria-labelledby={id}
			onClose={() => {
				if (!busy) onClose();
			}}
		>
			<Box
				component="form"
				onSubmit={(event) => {
					event.preventDefault();
					if (!busy && !invalid)
						fetcher.submit(
							{ path, name },
							{ method: "post", action: "/files/mkdir" },
						);
				}}
			>
				<DialogTitle id={id}>{t("新建文件夹")}</DialogTitle>
				<DialogContent>
					<DialogContentText sx={{ mb: 2, overflowWrap: "anywhere" }}>
						{t("创建位置：{path}").replace("{path}", path || t("全部文件"))}
					</DialogContentText>
					<TextField
						label={t("文件夹名称")}
						value={name}
						onChange={(event) => setName(event.target.value)}
						fullWidth
						autoFocus
						disabled={busy}
						error={!!name && invalid}
						helperText={
							invalid && name
								? t("名称不能为空，也不能包含斜杠或反斜杠。")
								: t("请输入文件夹名称。")
						}
					/>
					{fetcher.data?.error && (
						<Alert severity="error" sx={{ mt: 2 }}>
							{t(fetcher.data.error)}
						</Alert>
					)}
				</DialogContent>
				<DialogActions sx={{ px: 3, pb: 2 }}>
					<Button disabled={busy} onClick={onClose}>
						{t("取消")}
					</Button>
					<Button type="submit" variant="contained" disabled={busy || invalid}>
						{busy ? t("创建中…") : t("创建")}
					</Button>
				</DialogActions>
			</Box>
		</Dialog>
	);
}
