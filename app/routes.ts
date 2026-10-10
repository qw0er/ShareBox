import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("login", "routes/login.tsx"),
	route("logout", "routes/logout.ts"),
	route("public", "routes/public.tsx"),
	route("public/download", "routes/public-download.ts"),
	route("uploads/*", "routes/uploads.ts"),
	route("favicon.ico", "routes/favicon.ts"),
] satisfies RouteConfig;
