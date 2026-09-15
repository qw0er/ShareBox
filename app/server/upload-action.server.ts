import type {
	FileActionContext,
	FileActionResult,
} from "./action-types.server";

export async function handleUploadAction({
	form,
	requestLogger,
}: FileActionContext): Promise<FileActionResult> {
	if (!form.files.length) return { error: "No file uploaded" };
	if (form.fields.has("path")) return { error: "Invalid form data" };
	const results: NonNullable<FileActionResult["results"]> = [];
	for (const file of form.files) {
		try {
			await form.publish(file);
			requestLogger.info(
				{ operation: "upload", fileName: file.filename, fileSize: file.size },
				"File uploaded",
			);
			results.push({ filename: file.filename });
		} catch (error) {
			requestLogger.warn(
				{ err: error, operation: "upload", fileName: file.filename },
				"Unable to publish upload",
			);
			const conflict =
				error &&
				typeof error === "object" &&
				"code" in error &&
				error.code === "EEXIST";
			results.push({
				filename: file.filename,
				error: conflict
					? "同名文件或目录已存在，未覆盖原有内容。"
					: "上传失败，请检查存储空间和目录权限后重试。",
			});
		}
	}
	const failed = results.filter((result) => result.error).length;
	// Keep the single-file response compatible with existing clients.
	if (results.length === 1)
		return results[0].error ? { error: results[0].error } : { success: true };
	requestLogger.info(
		{ operation: "upload", total: results.length, failed },
		"Upload batch completed",
	);
	return failed
		? {
				error: `上传成功 ${results.length - failed} 个，失败 ${failed} 个。`,
				results,
			}
		: { success: true, results };
}
