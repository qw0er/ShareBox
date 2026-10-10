import BrightnessAutoOutlined from "@mui/icons-material/BrightnessAutoOutlined";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import {
	IconButton,
	ListItemIcon,
	ListItemText,
	Menu,
	MenuItem,
	Tooltip,
} from "@mui/material";
import { useColorScheme } from "@mui/material/styles";
import { useId, useState } from "react";

const modes = [
	{ value: "system", label: "跟随系统", Icon: BrightnessAutoOutlined },
	{ value: "light", label: "亮色模式", Icon: LightModeOutlined },
	{ value: "dark", label: "暗色模式", Icon: DarkModeOutlined },
] as const;

export default function ThemeModeButton() {
	const { mode, setMode } = useColorScheme();
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const menuId = useId();
	const current = modes.find((item) => item.value === mode) ?? modes[0];
	const Icon = current.Icon;
	return (
		<>
			<Tooltip title={`主题：${current.label}`}>
				<IconButton
					aria-label={`切换主题，当前${current.label}`}
					aria-haspopup="menu"
					aria-controls={anchor ? menuId : undefined}
					aria-expanded={anchor ? true : undefined}
					disabled={!mode}
					onClick={(event) => setAnchor(event.currentTarget)}
					color="inherit"
				>
					<Icon />
				</IconButton>
			</Tooltip>
			<Menu
				id={menuId}
				anchorEl={anchor}
				open={Boolean(anchor)}
				onClose={() => setAnchor(null)}
			>
				{modes.map(({ value, label, Icon: ModeIcon }) => (
					<MenuItem
						key={value}
						selected={mode === value}
						onClick={() => {
							setMode(value);
							setAnchor(null);
						}}
					>
						<ListItemIcon>
							<ModeIcon fontSize="small" />
						</ListItemIcon>
						<ListItemText>{label}</ListItemText>
					</MenuItem>
				))}
			</Menu>
		</>
	);
}
