export function publicPageUrl(relativePath = "") {
	return relativePath
		? `/public?${new URLSearchParams({ path: relativePath })}`
		: "/public";
}

export function publicDownloadUrl(relativePath: string) {
	return `/public/download?${new URLSearchParams({ path: relativePath })}`;
}
