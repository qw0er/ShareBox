import {
	CssBaseline,
	InitColorSchemeScript,
	ThemeProvider,
} from "@mui/material";
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useRouteLoaderData,
} from "react-router";
import GlobalErrorDialog from "~/components/feedback/GlobalErrorDialog";
import { LanguageContext, languageFromRequest, useTranslation } from "~/i18n";
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

export function loader({ request }: Route.LoaderArgs) {
	return languageFromRequest(request);
}

export function Layout({ children }: { children: React.ReactNode }) {
	const locale = useRouteLoaderData<typeof loader>("root") ?? {
		language: "en",
		preference: "system",
	};
	return (
		<html
			lang={locale.language === "zh" ? "zh-CN" : "en"}
			suppressHydrationWarning
		>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body>
				<InitColorSchemeScript
					attribute="class"
					defaultMode="system"
					modeStorageKey="sharebox-theme-mode"
				/>
				<ThemeProvider
					theme={theme}
					defaultMode="system"
					modeStorageKey="sharebox-theme-mode"
					disableTransitionOnChange
				>
					<CssBaseline />
					<LanguageContext.Provider value={locale}>
						{children}
					</LanguageContext.Provider>
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
	const t = useTranslation();
	let title = t("发生错误");
	let message = t("处理请求时发生异常，请稍后重试。");
	let actionHref: string | undefined;
	let actionLabel: string | undefined;

	if (isRouteErrorResponse(error)) {
		if (error.status === 404) {
			title = t("页面不存在");
			message = t("找不到你访问的页面，请返回首页继续操作。");
			actionHref = "/";
		} else if (error.status === 401) {
			title = t("请重新登录");
			message = t("登录已过期或尚未登录，重新登录后即可继续操作。");
			actionHref = "/login";
			actionLabel = t("前往登录");
		} else if (error.status === 503) {
			title = t("服务暂不可用");
			message = t("服务尚未完成配置或暂时不可用，请联系管理员检查配置与日志。");
		} else if (error.status === 403) {
			title = t("无权访问");
			message = t("请求未通过验证，请刷新页面并重新登录后重试。");
		} else if (error.status < 500) {
			title = `${t("请求失败")} (${error.status})`;
			message = t("当前请求无法处理，请刷新页面后重新操作。");
		}
	}

	return (
		<GlobalErrorDialog
			title={title}
			message={message}
			actionHref={actionHref}
			actionLabel={actionLabel}
		/>
	);
}
