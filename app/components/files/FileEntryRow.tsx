import FolderOutlined from "@mui/icons-material/FolderOutlined";
import InsertDriveFileOutlined from "@mui/icons-material/InsertDriveFileOutlined";
import { Box, Typography } from "@mui/material";

export const fileEntryButtonSx = {
	display: "flex",
	width: "100%",
	justifyContent: "flex-start",
	textAlign: "left",
	gap: 2,
	px: { xs: 2, sm: 3 },
	py: 2,
	"&:hover": { bgcolor: "action.hover" },
	"&.Mui-focusVisible": {
		outline: "2px solid",
		outlineColor: "primary.main",
		outlineOffset: -2,
	},
} as const;

export function FileEntryContent({
	name,
	directory,
	detail,
}: {
	name: string;
	directory: boolean;
	detail: string;
}) {
	return (
		<>
			{directory ? (
				<FolderOutlined color="primary" />
			) : (
				<InsertDriveFileOutlined sx={{ color: "text.secondary" }} />
			)}
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Typography
					sx={{ fontWeight: directory ? 600 : 500, overflowWrap: "anywhere" }}
				>
					{name}
				</Typography>
				<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
					{detail}
				</Typography>
			</Box>
		</>
	);
}
