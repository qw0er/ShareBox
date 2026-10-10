import { CONFIG } from "~/server/config.server";
import { withRequestLogging } from "~/server/logger.server";
import { downloadPublicFile } from "~/server/public-files.server";
import type { Route } from "./+types/public-download";

export function loader({ request }: Route.LoaderArgs) {
	return withRequestLogging(request, "public-download", async () => {
		return downloadPublicFile(CONFIG.datadir, request);
	});
}

export function action({ request }: Route.ActionArgs) {
	return withRequestLogging(request, "public-download", async () => {
		return new Response("下载仅支持 GET 或 HEAD 请求。", {
			status: 405,
			headers: { Allow: "GET, HEAD" },
		});
	});
}
