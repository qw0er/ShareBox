import { readBoundedForm } from "../form.server";
import { logger } from "../logger.server";
import { isShareId, publishFile, SHARE_HEADERS } from "./service.server";
import type { ShareStore } from "./store.server";

export async function handleShareAction(
	request: Request,
	operation: "create" | "revoke",
	store: ShareStore,
	filesDir: string,
	adminHost: string,
) {
	try {
		if (request.method !== "POST")
			return new Response(null, {
				status: 405,
				headers: { ...SHARE_HEADERS, Allow: "POST" },
			});
		const expectedOrigin = adminHost
			? `https://${adminHost}`
			: new URL(request.url).origin;
		if (request.headers.get("Origin") !== expectedOrigin)
			throw new Response("Invalid request origin", { status: 403 });
		let form: URLSearchParams;
		try {
			form = await readBoundedForm(request);
		} catch {
			throw new Response("The form is invalid or too large", { status: 400 });
		}
		if (operation === "create") {
			const relativePath = form.get("path");
			if (!relativePath || form.getAll("path").length !== 1)
				throw new Response("Please select a file", { status: 400 });
			const shareId = await publishFile(store, filesDir, relativePath);
			return Response.json(
				{ success: true, shareId },
				{ headers: SHARE_HEADERS },
			);
		}
		const id = form.get("shareId");
		if (!id || !isShareId(id) || form.getAll("shareId").length !== 1)
			throw new Response("Invalid share ID", { status: 400 });
		store.revoke(id);
		return Response.json({ success: true }, { headers: SHARE_HEADERS });
	} catch (error) {
		const status = error instanceof Response ? error.status : 500;
		logger[status >= 500 ? "error" : "warn"](
			{ component: "shares", operation, status },
			"Share action failed",
		);
		const message =
			error instanceof Response
				? await error.text()
				: "Share operation failed. Please try again later";
		return Response.json(
			{ error: message },
			{ status, headers: SHARE_HEADERS },
		);
	}
}
