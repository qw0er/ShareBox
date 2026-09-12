export function formatSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4);
	return `${(bytes / 1024 ** unit).toFixed(1)} ${["B", "KB", "MB", "GB", "TB"][unit]}`;
}
