import FolderSharedOutlined from "@mui/icons-material/FolderSharedOutlined";
import {
	AppBar,
	Box,
	Chip,
	Container,
	Stack,
	Toolbar,
	Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import LanguageButton from "~/components/layout/LanguageButton";
import ThemeModeButton from "~/components/layout/ThemeModeButton";
import { useTranslation } from "~/i18n";

export default function PublicShareLayout({
	children,
}: {
	children: ReactNode;
}) {
	const t = useTranslation();
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
							<FolderSharedOutlined fontSize="small" />
						</Box>
						<Typography variant="h6" sx={{ letterSpacing: "-0.04em" }}>
							ShareBox
						</Typography>
						<Box sx={{ flex: 1 }} />
						<Chip label={t("公开分享")} size="small" variant="outlined" />
						<LanguageButton />
						<ThemeModeButton />
					</Toolbar>
				</Container>
			</AppBar>
			<Container component="main" maxWidth="md" sx={{ py: { xs: 3, md: 6 } }}>
				{children}
				<Stack sx={{ mt: 3, textAlign: "center" }}>
					<Typography variant="caption" color="text.secondary">
						{t("由 ShareBox 提供文件分享")}
					</Typography>
				</Stack>
			</Container>
		</Box>
	);
}
