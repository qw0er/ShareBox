import type {
	FileActionContext,
	FileActionResult,
} from "./action-types.server";

export async function handleUploadAction({
	form,
	requestLogger,
}: FileActionContext): Promise<FileActionResult> {
	if (!form.filename) return { error: "No file uploaded" };
	if (form.fields.has("path")) return { error: "Invalid form data" };

	try {
		await form.publish();
		requestLogger.info(
			{ operation: "upload", fileName: form.filename, fileSize: form.size },
			"File uploaded",
		);
		return { success: true };
	} catch (error) {
		requestLogger.warn(
			{ err: error, operation: "upload", fileName: form.filename },
			"Unable to publish upload",
		);
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "EEXIST"
		) {
			return { error: "同名文件或目录已存在，未覆盖原有内容。" };
		}
		return { error: "上传失败，请检查存储空间和目录权限后重试。" };
	}
}
