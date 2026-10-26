import { getAuth } from "~/server/auth.server";
import { CONFIG } from "~/server/config.server";
import { withRequestLogging } from "~/server/logger.server";
import { handleShareAction } from "~/server/shares/actions.server";
import { shareStore } from "~/server/shares/runtime.server";
import type { Route } from "./+types/shares-revoke";

export function action({ request }: Route.ActionArgs) {
	return withRequestLogging(request, "shares.revoke", async () => {
		await getAuth().requireAdmin(request);
		return handleShareAction(
			request,
			"revoke",
			shareStore,
			CONFIG.filesDir,
			CONFIG.adminHost,
		);
	});
}
export const loader = action;
