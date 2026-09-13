import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import {
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	Stack,
} from "@mui/material";

interface GlobalErrorDialogProps {
	title: string;
	message: string;
	actionHref?: string;
}

export default function GlobalErrorDialog({
	title,
	message,
	actionHref,
}: GlobalErrorDialogProps) {
	return (
		<>
			<Box sx={{ minHeight: "100vh", bgcolor: "background.default" }} />
			<Dialog
				open
				disablePortal
				aria-labelledby="global-error-title"
				aria-describedby="global-error-description"
				maxWidth="xs"
				fullWidth
				slotProps={{
					paper: {
						sx: { mx: 2 },
					},
				}}
			>
				<DialogTitle id="global-error-title">
					<Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
						<Box
							sx={{
								display: "grid",
								placeItems: "center",
								width: 36,
								height: 36,
								borderRadius: 2,
								bgcolor: "error.main",
								color: "error.contrastText",
								flexShrink: 0,
							}}
						>
							<ErrorOutlineOutlined fontSize="small" />
						</Box>
						{title}
					</Stack>
				</DialogTitle>
				<DialogContent>
					<DialogContentText id="global-error-description">
						{message}
					</DialogContentText>
				</DialogContent>
				<DialogActions sx={{ px: 3, pb: 2.5 }}>
					{actionHref ? (
						<Button variant="contained" href={actionHref}>
							返回首页
						</Button>
					) : (
						<Button
							variant="contained"
							onClick={() => window.location.reload()}
						>
							重新加载
						</Button>
					)}
				</DialogActions>
			</Dialog>
		</>
	);
}
