import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import KeyOutlined from "@mui/icons-material/KeyOutlined";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import {
	AppBar,
	Box,
	Button,
	Chip,
	Container,
	Stack,
	Toolbar,
	Typography,
} from "@mui/material";
import { Form, Link, useNavigation } from "react-router";
import LanguageButton from "~/components/layout/LanguageButton";
import ThemeModeButton from "~/components/layout/ThemeModeButton";
import { useTranslation } from "~/i18n";

export default function WorkspaceLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const t = useTranslation();
	const busy = useNavigation().state !== "idle";
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
					<Toolbar
						disableGutters
						sx={{ gap: 1.5, minHeight: 76, flexWrap: "wrap", py: 1 }}
					>
						<Box
							sx={{
								display: "grid",
								placeItems: "center",
								bgcolor: "primary.main",
								color: "primary.contrastText",
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
						<Chip label={t("管理工作区")} size="small" variant="outlined" />
						<Button
							component={Link}
							to="/password"
							size="small"
							startIcon={<KeyOutlined />}
						>
							{t("修改密码")}
						</Button>
						<Form method="post" action="/logout">
							<Button
								type="submit"
								size="small"
								startIcon={<LogoutOutlined />}
								disabled={busy}
							>
								{t("退出登录")}
							</Button>
						</Form>
						<LanguageButton />
						<ThemeModeButton />
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
						{t("文件工作区")}
					</Typography>
					<Typography variant="h4" component="h1">
						{t("文件管理")}
					</Typography>
					<Typography color="text.secondary">
						{t("上传文件，浏览目录，在一个地方管理你的内容。")}
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
