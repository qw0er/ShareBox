/** Bound unauthenticated login bodies before decoding credentials. */
export async function readLoginForm(request: Request) {
	if (
		request.headers.get("Content-Type")?.split(";")[0] !==
		"application/x-www-form-urlencoded"
	)
		throw new Error("Invalid login form encoding");
	const reader = request.body?.getReader();
	if (!reader) throw new Error("Missing login form");
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			length += value.byteLength;
			if (length > 16 * 1024) {
				await reader.cancel();
				throw new Error("Login form too large");
			}
			chunks.push(value);
		}
		return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
	} finally {
		reader.releaseLock();
	}
}
