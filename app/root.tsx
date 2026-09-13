import { CssBaseline, ThemeProvider } from "@mui/material";
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from "react-router";
import GlobalErrorDialog from "~/components/feedback/GlobalErrorDialog";
import { theme } from "~/theme";

import type { Route } from "./+types/root";

export const links: Route.LinksFunction = () => [
	{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
	{ rel: "preconnect", href: "https://fonts.googleapis.com" },
	{
		rel: "preconnect",
		href: "https://fonts.gstatic.com",
		crossOrigin: "anonymous",
	},
	{
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
	},
];

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="zh-CN">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body>
				<ThemeProvider theme={theme}>
					<CssBaseline />
					{children}
				</ThemeProvider>
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let title = "发生错误";
	let message = "处理请求时发生异常，请稍后重试。";
	let actionHref: string | undefined;

	if (isRouteErrorResponse(error)) {
		if (error.status === 404) {
			title = "页面不存在";
			message = "找不到你访问的页面，请返回首页继续操作。";
			actionHref = "/";
		} else if (error.status === 403) {
			title = "无权访问";
			message = "你没有权限执行此操作。";
		} else if (error.status < 500) {
			title = `请求失败（${error.status}）`;
			message = error.statusText || "当前请求无法处理，请检查后重试。";
		}
	} else if (import.meta.env.DEV && error instanceof Error) {
		message = error.message;
	}

	return (
		<GlobalErrorDialog
			title={title}
			message={message}
			actionHref={actionHref}
		/>
	);
}
