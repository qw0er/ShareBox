import { getAuth } from "~/server/auth.server";
import { CONFIG } from "~/server/config.server";
import { downloadRequestedFile } from "~/server/files/delivery.server";
import { withRequestLogging } from "~/server/logger.server";
import type { Route } from "./+types/download";

export function loader({ request }: Route.LoaderArgs) {
	return withRequestLogging(request, "download", async () => {
		await getAuth().requireAdmin(request);
		return downloadRequestedFile(CONFIG.filesDir, request);
	});
}

export function action({ request }: Route.ActionArgs) {
	return withRequestLogging(request, "download", async () => {
		await getAuth().requireAdmin(request);
		return new Response("Downloads only support GET or HEAD requests.", {
			status: 405,
			headers: { Allow: "GET, HEAD" },
		});
	});
}
