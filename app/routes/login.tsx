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
import { Form, Link, redirect, useNavigation } from "react-router";
import ThemeModeButton from "~/components/layout/ThemeModeButton";
import { getAuth } from "~/server/auth.server";
import { withRequestLogging } from "~/server/logger.server";
import type { Route } from "./+types/login";

export function meta() {
	return [{ title: "管理员登录 · ShareBox" }];
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
	const busy = useNavigation().state !== "idle";
	return (
		<Box sx={{ minHeight: "100vh" }}>
			<Box sx={{ display: "flex", justifyContent: "flex-end", p: 2 }}>
				<ThemeModeButton />
			</Box>
			<Container maxWidth="xs" sx={{ py: { xs: 4, sm: 8 } }}>
				<Paper variant="outlined" sx={{ p: 4 }}>
					<Stack spacing={3} component={Form} method="post">
						<Stack spacing={1} sx={{ alignItems: "center" }}>
							<Inventory2Outlined color="primary" sx={{ fontSize: 36 }} />
							<Typography variant="h5" component="h1">
								管理员登录
							</Typography>
							<Typography color="text.secondary" variant="body2">
								登录 ShareBox，管理你的文件。
							</Typography>
						</Stack>
						{actionData?.error && (
							<Alert severity="error">{actionData.error}</Alert>
						)}
						<TextField
							name="username"
							label="用户名"
							autoComplete="username"
							required
							fullWidth
							disabled={busy}
							slotProps={{ htmlInput: { maxLength: 256 } }}
						/>
						<TextField
							name="password"
							label="密码"
							type="password"
							autoComplete="current-password"
							required
							fullWidth
							disabled={busy}
							slotProps={{ htmlInput: { maxLength: 1024 } }}
						/>
						<Button type="submit" variant="contained" disabled={busy}>
							{busy ? "登录中…" : "登录"}
						</Button>
						<Button component={Link} to="/public">
							浏览公开文件
						</Button>
					</Stack>
				</Paper>
			</Container>
		</Box>
	);
}
