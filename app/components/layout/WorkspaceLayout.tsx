import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import {
	AppBar,
	Box,
	Chip,
	Container,
	Stack,
	Toolbar,
	Typography,
} from "@mui/material";

export default function WorkspaceLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<Box sx={{ minHeight: "100vh" }}>
			<AppBar
				position="static"
				color="transparent"
				elevation={0}
				sx={{
					bgcolor: "background.paper",
					borderBottom: 1,
					borderColor: "divider",
				}}
			>
				<Container maxWidth="lg">
					<Toolbar disableGutters sx={{ gap: 1.5, minHeight: 76 }}>
						<Box
							sx={{
								display: "grid",
								placeItems: "center",
								bgcolor: "primary.main",
								color: "white",
								width: 38,
								height: 38,
								borderRadius: 2,
							}}
						>
							<Inventory2Outlined fontSize="small" />
						</Box>
						<Typography variant="h6" sx={{ letterSpacing: "-0.04em" }}>
							ShareBox
						</Typography>
						<Box sx={{ flex: 1 }} />
						<Chip label="管理工作区" size="small" variant="outlined" />
					</Toolbar>
				</Container>
			</AppBar>
			<Container component="main" maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
				<Stack spacing={1} sx={{ mb: 4 }}>
					<Typography
						variant="overline"
						color="primary"
						sx={{ letterSpacing: 2 }}
					>
						文件工作区
					</Typography>
					<Typography variant="h4" component="h1">
						文件管理
					</Typography>
					<Typography color="text.secondary">
						上传文件，浏览目录，在一个地方管理你的内容。
					</Typography>
				</Stack>
				<Box
					sx={{
						display: "grid",
						gridTemplateColumns: {
							xs: "minmax(0, 1fr)",
							md: "minmax(0, 1fr) 340px",
						},
						gap: 3,
						alignItems: "start",
					}}
				>
					{children}
				</Box>
			</Container>
		</Box>
	);
}
