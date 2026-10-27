import { getAuth } from "~/server/auth.server";
import { prepareFileAction } from "~/server/file-actions.server";
import { withRequestLogging } from "~/server/logger.server";
import { synchronizeFileShares } from "~/server/shares/file-sync.server";
import { shareStore } from "~/server/shares/runtime.server";
import { handleTransferAction } from "~/server/transfer-action.server";
import type { Route } from "./+types/files-copy";

export function action({ request }: Route.ActionArgs) {
	return withRequestLogging(request, "files.copy", async () => {
		await getAuth().requireAdmin(request);
		const prepared = await prepareFileAction(request, "copy");
		if (!prepared.ok) return prepared.result;
		const result = await handleTransferAction(prepared.context, "copy");
		return synchronizeFileShares(result, shareStore);
	});
}
