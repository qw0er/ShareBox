export function publicPageUrl(relativePath = "") {
	return relativePath
		? `/public?${new URLSearchParams({ path: relativePath })}`
		: "/public";
}
