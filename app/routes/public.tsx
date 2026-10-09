import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import {
	Alert,
	AppBar,
	Box,
	Button,
	Chip,
	Container,
	Stack,
	Toolbar,
	Typography,
} from "@mui/material";
import { isRouteErrorResponse, Link } from "react-router";
import PublicBrowser from "~/components/public/PublicBrowser";
import { CONFIG } from "~/server/config.server";
import { readPublicDirectory } from "~/server/public-files.server";
import type { Route } from "./+types/public";

export function meta() {
	return [
		{ title: "公开文件 · ShareBox" },
		{ name: "description", content: "浏览和下载 ShareBox 公开文件" },
	];
}

export function loader({ request }: Route.LoaderArgs) {
	return readPublicDirectory(
		CONFIG.datadir,
		new URL(request.url).searchParams.get("path") || "",
	);
}

function PublicLayout({ children }: { children: React.ReactNode }) {
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
				<Container maxWidth="md">
					<Toolbar disableGutters sx={{ gap: 1.5, minHeight: 76 }}>
						<Inventory2Outlined color="primary" />
						<Typography variant="h6">ShareBox</Typography>
						<Box sx={{ flex: 1 }} />
						<Chip label="公开文件" size="small" variant="outlined" />
					</Toolbar>
				</Container>
			</AppBar>
			<Container component="main" maxWidth="md" sx={{ py: { xs: 3, md: 6 } }}>
				<Stack spacing={1} sx={{ mb: 4 }}>
					<Typography variant="h4" component="h1">
						文件下载
					</Typography>
					<Typography color="text.secondary">
						浏览共享目录，下载你需要的文件。
					</Typography>
				</Stack>
				{children}
			</Container>
		</Box>
	);
}

export default function PublicPage({ loaderData }: Route.ComponentProps) {
	return (
		<PublicLayout>
			<PublicBrowser key={loaderData.path} {...loaderData} />
		</PublicLayout>
	);
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	const status = isRouteErrorResponse(error) ? error.status : 500;
	const message =
		status === 404
			? "文件或目录不存在，可能已经被移动或删除。"
			: status === 400
				? "目录路径无效，请返回全部文件。"
				: "暂时无法读取文件，请稍后重试。";
	return (
		<PublicLayout>
			<Stack spacing={3}>
				<Alert severity="error">{message}</Alert>
				<Button
					component={Link}
					to="/public"
					variant="contained"
					sx={{ alignSelf: "start" }}
				>
					返回全部文件
				</Button>
			</Stack>
		</PublicLayout>
	);
}
