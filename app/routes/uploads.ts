import { getAuth } from "~/server/auth.server";
import { withRequestLogging } from "~/server/logger.server";
import { handleTusRequest } from "~/server/tus.server";
import type { Route } from "./+types/uploads";

export async function loader({ request }: Route.LoaderArgs) {
	return withRequestLogging(request, "uploads", async () => {
		await getAuth().requireAdmin(request);
		return handleTusRequest(request);
	});
}
export async function action({ request }: Route.ActionArgs) {
	return withRequestLogging(request, "uploads", async () => {
		await getAuth().requireAdmin(request);
		return handleTusRequest(request);
	});
}
