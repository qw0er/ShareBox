export type ShareSummary = {
	id: string;
	kind?: "file" | "directory";
	targetPath: string;
	status: "valid" | "invalid";
};
export type ShareActionResult = {
	success?: true;
	shareId?: string;
	error?: string;
};
