export type ShareSummary = {
	id: string;
	targetPath: string;
	status: "valid" | "invalid";
};
export type ShareActionResult = {
	success?: true;
	shareId?: string;
	error?: string;
};
