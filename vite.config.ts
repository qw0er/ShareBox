import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => ({
	define: {
		"import.meta.env.SHAREBOX_ADMIN_HOST": JSON.stringify(
			process.env.USER_URL || loadEnv(mode, process.cwd(), "").USER_URL || "",
		),
	},
	plugins: [tailwindcss(), reactRouter()],
	resolve: {
		tsconfigPaths: true,
	},
}));
