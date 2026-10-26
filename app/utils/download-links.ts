export function privateDownloadUrl(relativePath: string) {
	return `/download?${new URLSearchParams({ path: relativePath })}`;
}
