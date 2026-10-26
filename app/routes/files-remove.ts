import { getAuth } from "~/server/auth.server";
import { prepareFileAction } from "~/server/file-actions.server";
import { withRequestLogging } from "~/server/logger.server";
import { handleRemoveAction } from "~/server/remove-action.server";
import { synchronizeFileShares } from "~/server/shares/file-sync.server";
import { shareStore } from "~/server/shares/runtime.server";
import type { Route } from "./+types/files-remove";

export function action({ request }: Route.ActionArgs) {
	return withRequestLogging(request, "files.remove", async () => {
		await getAuth().requireAdmin(request);
		const prepared = await prepareFileAction(request, "remove");
		if (!prepared.ok) return prepared.result;
		const result = await handleRemoveAction(prepared.context);
		return synchronizeFileShares(result, shareStore);
	});
}
