import { Typography } from "@mui/material";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import type { FileNode } from "~/server/core.server";

type RemoveResult =
	| { success: true; error?: undefined }
	| { error: string; success?: undefined };

export default function FileItemLabel({ node }: { node: FileNode }) {
	const fetcher = useFetcher<RemoveResult>();
	const [open, setOpen] = useState(false);
	const [snackbarMessage, setSnackbarMessage] = useState("");

	useEffect(() => {
		if (fetcher.data?.success) {
			setSnackbarMessage(`Removed: ${node.name}`);
			setOpen(true);
		} else if (fetcher.data?.error) {
			setSnackbarMessage(fetcher.data.error);
			setOpen(true);
		}
	}, [fetcher.data, node.name]);

	return (
		<Stack direction="row" sx={{ justifyContent: "space-around" }}>
			<Typography>{node.name}</Typography>
			<fetcher.Form
				method="post"
				onClick={(event) => event.stopPropagation()}
				onMouseDown={(event) => event.stopPropagation()}
			>
				<input type="hidden" name="intent" value="remove" />
				<input type="hidden" name="path" value={node.path} />
				<Button
					variant="contained"
					color="error"
					type="submit"
					disabled={fetcher.state !== "idle"}
				>
					{fetcher.state === "idle" ? "Remove" : "Removing..."}
				</Button>
			</fetcher.Form>
			<Snackbar
				open={open}
				autoHideDuration={6000}
				onClose={() => setOpen(false)}
				message={snackbarMessage}
			/>
		</Stack>
	);
}
