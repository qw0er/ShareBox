import { createTheme } from "@mui/material";

export const theme = createTheme({
	palette: {
		primary: { main: "#386647" },
		background: { default: "#f5f7f5", paper: "#ffffff" },
		text: { primary: "#202923", secondary: "#667169" },
		divider: "#e3e8e3",
	},
	typography: {
		fontFamily: 'Inter, "Noto Sans SC", sans-serif',
		h4: { fontWeight: 650, letterSpacing: "-0.04em" },
		h6: { fontWeight: 600 },
		button: { textTransform: "none", fontWeight: 600 },
	},
	shape: { borderRadius: 12 },
	components: {
		MuiButton: {
			defaultProps: { disableElevation: true },
			styleOverrides: { root: { borderRadius: 8 } },
		},
		MuiPaper: { defaultProps: { elevation: 0 } },
	},
});
