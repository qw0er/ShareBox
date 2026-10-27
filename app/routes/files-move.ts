import { getAuth } from "~/server/auth.server";
import { prepareFileAction } from "~/server/file-actions.server";
import { withRequestLogging } from "~/server/logger.server";
import { synchronizeFileShares } from "~/server/shares/file-sync.server";
import { shareStore } from "~/server/shares/runtime.server";
import { handleTransferAction } from "~/server/transfer-action.server";
import type { Route } from "./+types/files-move";

export function action({ request }: Route.ActionArgs) {
	return withRequestLogging(request, "files.move", async () => {
		await getAuth().requireAdmin(request);
		const prepared = await prepareFileAction(request, "move");
		if (!prepared.ok) return prepared.result;
		const result = await handleTransferAction(prepared.context, "move");
		return synchronizeFileShares(result, shareStore);
	});
}
