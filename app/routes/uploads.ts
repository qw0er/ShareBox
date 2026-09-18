import { handleTusRequest } from "~/server/tus.server";
import type { Route } from "./+types/uploads";

export function loader({ request }: Route.LoaderArgs) {
	return handleTusRequest(request);
}
export function action({ request }: Route.ActionArgs) {
	return handleTusRequest(request);
}
