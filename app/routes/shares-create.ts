import { getAuth } from "~/server/auth.server";
import { CONFIG } from "~/server/config.server";
import { withRequestLogging } from "~/server/logger.server";
import { handleShareAction } from "~/server/shares/actions.server";
import { shareStore } from "~/server/shares/runtime.server";
import type { Route } from "./+types/shares-create";

export function action({ request }: Route.ActionArgs) {
	return withRequestLogging(request, "shares.create", async () => {
		await getAuth().requireAdmin(request);
		return handleShareAction(
			request,
			"create",
			shareStore,
			CONFIG.filesDir,
			CONFIG.adminHost,
		);
	});
}
export const loader = action;
