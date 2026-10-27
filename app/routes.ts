import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("login", "routes/login.tsx"),
	route("logout", "routes/logout.ts"),
	route("password", "routes/password.tsx"),
	route("download", "routes/download.ts"),
	route("shares/create", "routes/shares-create.ts"),
	route("shares/revoke", "routes/shares-revoke.ts"),
	route("s/:shareId", "routes/share.tsx"),
	route("s/:shareId/download", "routes/share-download.ts"),
	route("files/remove", "routes/files-remove.ts"),
	route("files/rename", "routes/files-rename.ts"),
	route("files/move", "routes/files-move.ts"),
	route("files/copy", "routes/files-copy.ts"),
	route("files/mkdir", "routes/files-mkdir.ts"),
	route("uploads/*", "routes/uploads.ts"),
	route("favicon.ico", "routes/favicon.ts"),
] satisfies RouteConfig;
