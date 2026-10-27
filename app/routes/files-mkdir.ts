import { getAuth } from "~/server/auth.server";
import { prepareFileAction } from "~/server/file-actions.server";
import { withRequestLogging } from "~/server/logger.server";
import { handleMkdirAction } from "~/server/mkdir-action.server";
import type { Route } from "./+types/files-mkdir";

export function action({ request }: Route.ActionArgs) {
	return withRequestLogging(request, "files.mkdir", async () => {
		await getAuth().requireAdmin(request);
		const prepared = await prepareFileAction(request, "mkdir");
		if (!prepared.ok) return prepared.result;
		return handleMkdirAction(prepared.context);
	});
}
