import { getAuth } from "~/server/auth.server";
import type { Route } from "./+types/logout";

export function loader() {
	throw new Response("Method not allowed", {
		status: 405,
		headers: { Allow: "POST" },
	});
}
export function action({ request }: Route.ActionArgs) {
	return getAuth().logout(request);
}
