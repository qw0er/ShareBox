import { CONFIG } from "~/server/config.server";
import { withRequestLogging } from "~/server/logger.server";
import { shareStore } from "~/server/shares/runtime.server";
import { downloadShare, SHARE_HEADERS } from "~/server/shares/service.server";
import type { Route } from "./+types/share-download";

export function loader({ request, params }: Route.LoaderArgs) {
	return withRequestLogging(request, "shares.download", () =>
		downloadShare(shareStore, CONFIG.filesDir, params.shareId, request),
	);
}
export function action({ request }: Route.ActionArgs) {
	return withRequestLogging(
		request,
		"shares.download",
		() =>
			new Response(null, {
				status: 405,
				headers: { ...SHARE_HEADERS, Allow: "GET, HEAD" },
			}),
	);
}
