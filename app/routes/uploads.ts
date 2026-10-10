import { getAuth } from "~/server/auth.server";
import { handleTusRequest } from "~/server/tus.server";
import type { Route } from "./+types/uploads";

export async function loader({ request }: Route.LoaderArgs) {
	await getAuth().requireAdmin(request);
	return handleTusRequest(request);
}
export async function action({ request }: Route.ActionArgs) {
	await getAuth().requireAdmin(request);
	return handleTusRequest(request);
}
