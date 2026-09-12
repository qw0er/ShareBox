import { Typography } from "@mui/material";
import Button from "@mui/material/Button";
import { Form } from "react-router";
import type { FileNode } from "~/server/core.server";
import FileTree from "./FileTree";

type ActionData =
	| {
			error: string;
			success?: undefined;
	  }
	| {
			success: boolean;
			error?: undefined;
	  }
	| undefined;
export default function MainPage({
	actionData,
	fileTree,
}: {
	actionData: ActionData;
	fileTree?: FileNode[];
}) {
	return (
		<>
			<Typography variant="h1">ShareBox</Typography>
			<Form method="post" encType="multipart/form-data">
				<input type="file" name="file" required />
				<Button type="submit" variant="contained" color="primary">
					Upload
				</Button>
			</Form>
			{actionData?.error && (
				<Typography color="error">{actionData.error}</Typography>
			)}
			<FileTree fileTree={fileTree ?? []} />
		</>
	);
}
