import { CONFIG } from "~/server/config.server";
import { downloadPublicFile } from "~/server/public-files.server";
import type { Route } from "./+types/public-download";

export function loader({ request }: Route.LoaderArgs) {
	return downloadPublicFile(CONFIG.datadir, request);
}

export function action() {
	return new Response("Method Not Allowed", {
		status: 405,
		headers: { Allow: "GET, HEAD" },
	});
}
