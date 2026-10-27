function errorCode(error: unknown) {
	return error instanceof Error && "code" in error
		? String(error.code)
		: undefined;
}
const validationMessages: Record<string, string> = {
	"Invalid file path": "Invalid file path. Refresh the list and try again.",
	"Symbolic links are not supported":
		"Symbolic links are not supported. Select a regular file or folder.",
	"Unsupported file type": "This file type is not supported.",
};
export function fileOperationLevel(error: unknown) {
	return ["ENOENT", "ENOTDIR", "ENOTEMPTY", "EEXIST"].includes(
		errorCode(error) ?? "",
	) ||
		(error instanceof Error && error.message in validationMessages)
		? "warn"
		: "error";
}
export function fileOperationMessage(error: unknown, operation: string) {
	const code = errorCode(error);
	if (code === "ENOENT" || code === "ENOTDIR")
		return "The file or folder no longer exists. Refresh the list.";
	if (code === "ENOTEMPTY")
		return "The folder is not empty. Remove its contents first.";
	if (code === "EEXIST")
		return "A file or folder with this name already exists. Choose another name.";
	if (code === "EACCES" || code === "EPERM")
		return `Unable to ${operation}. Contact the administrator to check storage permissions.`;
	if (error instanceof Error && validationMessages[error.message])
		return validationMessages[error.message];
	return `Unable to ${operation}. Try again later or contact the administrator.`;
}
