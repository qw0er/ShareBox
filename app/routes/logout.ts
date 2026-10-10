import { getAuth } from "~/server/auth.server";
import { withRequestLogging } from "~/server/logger.server";
import type { Route } from "./+types/logout";

export function loader({ request }: Route.LoaderArgs) {
	return withRequestLogging(request, "logout", async () => {
		throw new Response("请使用退出登录按钮提交此操作。", {
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
