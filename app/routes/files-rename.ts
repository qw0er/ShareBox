import { getAuth } from "~/server/auth.server";
import { prepareFileAction } from "~/server/file-actions.server";
import { withRequestLogging } from "~/server/logger.server";
import { handleRenameAction } from "~/server/rename-action.server";
import { synchronizeFileShares } from "~/server/shares/file-sync.server";
import { shareStore } from "~/server/shares/runtime.server";
import type { Route } from "./+types/files-rename";

export function action({ request }: Route.ActionArgs) {
	return withRequestLogging(request, "files.rename", async () => {
		await getAuth().requireAdmin(request);
		const prepared = await prepareFileAction(request, "rename");
		if (!prepared.ok) return prepared.result;
		const result = await handleRenameAction(prepared.context);
		return synchronizeFileShares(result, shareStore);
	});
}
