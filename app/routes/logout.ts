import { getAuth } from "~/server/auth.server";
import { withRequestLogging } from "~/server/logger.server";
import type { Route } from "./+types/logout";

export function loader({ request }: Route.LoaderArgs) {
	return withRequestLogging(request, "logout", async () => {
		throw new Response("Use the sign out button to submit this operation.", {
			status: 405,
			headers: { Allow: "POST" },
		});
	});
}
export function action({ request }: Route.ActionArgs) {
	return withRequestLogging(request, "logout", async () => {
		return getAuth().logout(request);
	});
}
