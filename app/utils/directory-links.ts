export function directoryUrl(base: string, path: string) {
	return path ? `${base}?${new URLSearchParams({ path })}` : base;
}

export function sharedDownloadUrl(shareId: string, path = "") {
	return directoryUrl(`/s/${shareId}/download`, path);
}
