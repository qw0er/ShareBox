function errorCode(error: unknown) {
	return error instanceof Error && "code" in error
		? String(error.code)
		: undefined;
}
const validationMessages: Record<string, string> = {
	"Invalid file path": "文件路径无效，请刷新列表后重试。",
	"Symbolic links are not supported":
		"不支持操作符号链接，请选择普通文件或文件夹。",
	"Unsupported file type": "不支持此文件类型。",
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
		return "文件或文件夹已不存在，请刷新列表。";
	if (code === "ENOTEMPTY") return "文件夹不为空，请先删除其中的内容。";
	if (code === "EEXIST") return "同名文件或文件夹已存在，请换一个名称。";
	if (code === "EACCES" || code === "EPERM")
		return `无法${operation}，请联系管理员检查存储目录权限。`;
	if (error instanceof Error && validationMessages[error.message])
		return validationMessages[error.message];
	return `${operation}失败，请稍后重试；若仍失败，请联系管理员查看日志。`;
}
