import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import {
	Alert,
	Box,
	Button,
	Container,
	Paper,
	Stack,
	TextField,
	Typography,
} from "@mui/material";
import { Form, redirect, useNavigation } from "react-router";
import LanguageButton from "~/components/layout/LanguageButton";
import ThemeModeButton from "~/components/layout/ThemeModeButton";
import { useTranslation } from "~/i18n";
import { getAuth } from "~/server/auth.server";
import { withRequestLogging } from "~/server/logger.server";
import type { Route } from "./+types/login";

export function meta() {
	return [{ title: "Administrator sign in · ShareBox" }];
}
export async function loader({ request }: Route.LoaderArgs) {
	return withRequestLogging(request, "login", async () => {
		if (await getAuth().isAuthenticated(request))
			throw redirect("/", { headers: { "Cache-Control": "no-store" } });
		return null;
	});
}
export function action({ request }: Route.ActionArgs) {
	return withRequestLogging(request, "login", async () => {
		return getAuth().login(request);
	});
}
export function headers() {
	return { "Cache-Control": "no-store" };
}

export default function Login({ actionData }: Route.ComponentProps) {
	const t = useTranslation();
	const busy = useNavigation().state !== "idle";
	return (
		<Box sx={{ minHeight: "100vh" }}>
			<Box sx={{ display: "flex", justifyContent: "flex-end", p: 2 }}>
				<LanguageButton />
				<ThemeModeButton />
			</Box>
			<Container maxWidth="xs" sx={{ py: { xs: 4, sm: 8 } }}>
				<Paper variant="outlined" sx={{ p: 4 }}>
					<Stack spacing={3} component={Form} method="post">
						<Stack spacing={1} sx={{ alignItems: "center" }}>
							<Inventory2Outlined color="primary" sx={{ fontSize: 36 }} />
							<Typography variant="h5" component="h1">
								{t("管理员登录")}
							</Typography>
							<Typography color="text.secondary" variant="body2">
								{t("登录 ShareBox，管理你的文件。")}
							</Typography>
						</Stack>
						{actionData?.error && (
							<Alert severity="error">{t(actionData.error)}</Alert>
						)}
						<TextField
							name="username"
							label={t("用户名")}
							autoComplete="username"
							required
							fullWidth
							disabled={busy}
							slotProps={{ htmlInput: { maxLength: 256 } }}
						/>
						<TextField
							name="password"
							label={t("密码")}
							type="password"
							autoComplete="current-password"
							required
							fullWidth
							disabled={busy}
							slotProps={{ htmlInput: { maxLength: 1024 } }}
						/>
						<Button type="submit" variant="contained" disabled={busy}>
							{busy ? t("登录中…") : t("登录")}
						</Button>
					</Stack>
				</Paper>
			</Container>
		</Box>
	);
}
