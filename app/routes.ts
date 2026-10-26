import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("login", "routes/login.tsx"),
	route("logout", "routes/logout.ts"),
	route("download", "routes/download.ts"),
	route("files/remove", "routes/files-remove.ts"),
	route("files/rename", "routes/files-rename.ts"),
	route("uploads/*", "routes/uploads.ts"),
	route("favicon.ico", "routes/favicon.ts"),
] satisfies RouteConfig;
