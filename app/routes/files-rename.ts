import { getAuth } from "~/server/auth.server";
import { prepareFileAction } from "~/server/file-actions.server";
import { withRequestLogging } from "~/server/logger.server";
import { handleRenameAction } from "~/server/rename-action.server";
import type { Route } from "./+types/files-rename";

export function action({ request }: Route.ActionArgs) {
	return withRequestLogging(request, "files.rename", async () => {
		await getAuth().requireAdmin(request);
		const prepared = await prepareFileAction(request, "rename");
		if (!prepared.ok) return prepared.result;
		return handleRenameAction(prepared.context);
	});
}
