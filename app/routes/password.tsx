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
import { Form, Link, useNavigation } from "react-router";
import { getAuth } from "~/server/auth.server";
import { withRequestLogging } from "~/server/logger.server";
import type { Route } from "./+types/password";

export async function loader({ request }: Route.LoaderArgs) {
	return withRequestLogging(request, "password", async () => {
		await getAuth().requireAdmin(request, true);
		return null;
	});
}

export function action({ request }: Route.ActionArgs) {
	return withRequestLogging(request, "password", () =>
		getAuth().changePassword(request),
	);
}

export function headers() {
	return { "Cache-Control": "no-store" };
}

export default function Password({ actionData }: Route.ComponentProps) {
	const busy = useNavigation().state !== "idle";
	return (
		<Box sx={{ minHeight: "100vh" }}>
			<Container maxWidth="xs" sx={{ py: { xs: 4, sm: 8 } }}>
				<Paper variant="outlined" sx={{ p: 4 }}>
					<Stack spacing={3} component={Form} method="post">
						<Typography variant="h5" component="h1">
							修改密码
						</Typography>
						<Typography color="text.secondary" variant="body2">
							修改后所有设备都需要重新登录。
						</Typography>
						{actionData?.error && (
							<Alert severity="error">{actionData.error}</Alert>
						)}
						<TextField
							name="currentPassword"
							label="当前密码"
							type="password"
							autoComplete="current-password"
							required
							fullWidth
							disabled={busy}
							slotProps={{ htmlInput: { maxLength: 1024 } }}
						/>
						<TextField
							name="newPassword"
							label="新密码"
							type="password"
							autoComplete="new-password"
							required
							fullWidth
							disabled={busy}
							helperText="请输入 8 至 1024 个字符。"
							slotProps={{ htmlInput: { minLength: 8, maxLength: 1024 } }}
						/>
						<TextField
							name="confirmPassword"
							label="确认新密码"
							type="password"
							autoComplete="new-password"
							required
							fullWidth
							disabled={busy}
							slotProps={{ htmlInput: { minLength: 8, maxLength: 1024 } }}
						/>
						<Button type="submit" variant="contained" disabled={busy}>
							{busy ? "保存中…" : "修改密码"}
						</Button>
						<Button component={Link} to="/" disabled={busy}>
							返回文件管理
						</Button>
					</Stack>
				</Paper>
			</Container>
		</Box>
	);
}
