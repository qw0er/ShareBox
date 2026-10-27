import LanguageOutlined from "@mui/icons-material/LanguageOutlined";
import { IconButton, Menu, MenuItem, Tooltip } from "@mui/material";
import { useContext, useId, useState } from "react";
import {
	LANGUAGE_COOKIE,
	LanguageContext,
	type LanguagePreference,
	useTranslation,
} from "~/i18n";

export default function LanguageButton() {
	const { preference } = useContext(LanguageContext);
	const t = useTranslation();
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const id = useId();
	function select(value: LanguagePreference) {
		// biome-ignore lint/suspicious/noDocumentCookie: Cookie Store is not supported by all browsers.
		document.cookie = `${LANGUAGE_COOKIE}=${value}; Path=/; SameSite=Lax; Max-Age=31536000`;
		window.location.reload();
	}
	return (
		<>
			<Tooltip title={t("语言")}>
				<IconButton
					color="inherit"
					aria-label={t("语言")}
					aria-haspopup="menu"
					aria-controls={anchor ? id : undefined}
					aria-expanded={!!anchor}
					onClick={(event) => setAnchor(event.currentTarget)}
				>
					<LanguageOutlined />
				</IconButton>
			</Tooltip>
			<Menu
				id={id}
				anchorEl={anchor}
				open={!!anchor}
				onClose={() => setAnchor(null)}
			>
				<MenuItem
					selected={preference === "system"}
					onClick={() => select("system")}
				>
					{t("跟随系统")}
				</MenuItem>
				<MenuItem selected={preference === "en"} onClick={() => select("en")}>
					English
				</MenuItem>
				<MenuItem selected={preference === "zh"} onClick={() => select("zh")}>
					简体中文
				</MenuItem>
			</Menu>
		</>
	);
}
