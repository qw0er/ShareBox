import FolderOutlined from "@mui/icons-material/FolderOutlined";
import Refresh from "@mui/icons-material/Refresh";
import Search from "@mui/icons-material/Search";
import {
	Box,
	Breadcrumbs,
	Button,
	InputAdornment,
	LinearProgress,
	Link,
	MenuItem,
	Paper,
	Stack,
	TextField,
	Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import { useState } from "react";
import {
	Link as RouterLink,
	useNavigation,
	useRevalidator,
} from "react-router";

export type BrowserEntry = {
	name: string;
	path: string;
	type: "file" | "directory";
	size?: number;
	modifiedAt?: string;
};

export default function DirectoryBrowser<Entry extends BrowserEntry>({
	path,
	entries,
	onNavigate,
	directoryUrl,
	renderEntry,
}: {
	path: string;
	entries: Entry[];
	onNavigate?: (path: string) => void;
	directoryUrl?: (path: string) => string;
	renderEntry: (entry: Entry) => ReactNode;
}) {
	const [filter, setFilter] = useState("");
	const [sort, setSort] = useState("name");
	const revalidator = useRevalidator();
	const navigation = useNavigation();
	const busy = revalidator.state !== "idle" || navigation.state !== "idle";
	const segments = path ? path.split("/") : [];
	const visible = entries
		.filter((entry) =>
			entry.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
		)
		.sort((a, b) => {
			if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
			if (sort === "size")
				return (b.size ?? 0) - (a.size ?? 0) || a.name.localeCompare(b.name);
			if (sort === "modified")
				return (
					(b.modifiedAt ?? "").localeCompare(a.modifiedAt ?? "") ||
					a.name.localeCompare(b.name)
				);
			return a.name.localeCompare(b.name);
		});
	return (
		<Paper
			component="section"
			variant="outlined"
			aria-label="文件列表"
			sx={{ overflow: "hidden" }}
		>
			<Stack spacing={2.5} sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
					<Breadcrumbs sx={{ flex: 1, overflowWrap: "anywhere" }}>
						<Link
							component={onNavigate ? "button" : RouterLink}
							to={directoryUrl?.("")}
							onClick={onNavigate ? () => onNavigate("") : undefined}
							underline="hover"
						>
							全部文件
						</Link>
						{segments.map((name, index) =>
							index === segments.length - 1 ? (
								<Typography
									key={segments.slice(0, index + 1).join("/")}
									color="text.primary"
								>
									{name}
								</Typography>
							) : (
								<Link
									key={segments.slice(0, index + 1).join("/")}
									component={onNavigate ? "button" : RouterLink}
									to={
										onNavigate
											? undefined
											: directoryUrl?.(segments.slice(0, index + 1).join("/"))
									}
									onClick={
										onNavigate
											? () => onNavigate(segments.slice(0, index + 1).join("/"))
											: undefined
									}
									underline="hover"
								>
									{name}
								</Link>
							),
						)}
					</Breadcrumbs>
					<Button
						startIcon={<Refresh />}
						disabled={busy}
						onClick={() => revalidator.revalidate()}
					>
						{busy ? "加载中" : "刷新"}
					</Button>
				</Stack>
				<Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
					<TextField
						size="small"
						label="筛选当前目录"
						value={filter}
						onChange={(event) => setFilter(event.target.value)}
						sx={{ flex: 1 }}
						slotProps={{
							input: {
								startAdornment: (
									<InputAdornment position="start">
										<Search fontSize="small" />
									</InputAdornment>
								),
							},
						}}
					/>
					<TextField
						select
						size="small"
						label="排序"
						value={sort}
						onChange={(event) => setSort(event.target.value)}
						sx={{ minWidth: 150 }}
					>
						<MenuItem value="name">名称</MenuItem>
						{entries.some((entry) => entry.modifiedAt) && (
							<MenuItem value="modified">最近修改</MenuItem>
						)}
						<MenuItem value="size">大小优先</MenuItem>
					</TextField>
				</Stack>
			</Stack>
			<Box sx={{ height: 4 }}>{busy && <LinearProgress />}</Box>
			<Box
				aria-busy={busy}
				sx={{ opacity: busy ? 0.6 : 1, pointerEvents: busy ? "none" : "auto" }}
			>
				{path && (
					<Box sx={{ px: 3, py: 1.5, borderTop: 1, borderColor: "divider" }}>
						<Link
							component={onNavigate ? "button" : RouterLink}
							to={
								onNavigate
									? undefined
									: directoryUrl?.(segments.slice(0, -1).join("/"))
							}
							onClick={
								onNavigate
									? () => onNavigate(segments.slice(0, -1).join("/"))
									: undefined
							}
							underline="hover"
						>
							返回上级目录
						</Link>
					</Box>
				)}
				{visible.map((entry) => (
					<Box key={entry.path}>{renderEntry(entry)}</Box>
				))}
				{!visible.length && (
					<Stack
						spacing={1}
						sx={{
							alignItems: "center",
							py: 8,
							px: 2,
							borderTop: 1,
							borderColor: "divider",
						}}
					>
						<FolderOutlined sx={{ fontSize: 48, color: "text.secondary" }} />
						<Typography sx={{ fontWeight: 600 }}>
							{entries.length ? "没有匹配的文件" : "这个目录还没有文件"}
						</Typography>
						<Typography variant="body2" color="text.secondary">
							{entries.length
								? "试试其他名称，或清空筛选条件。"
								: "文件添加后，点击刷新即可查看。"}
						</Typography>
					</Stack>
				)}
			</Box>
		</Paper>
	);
}
