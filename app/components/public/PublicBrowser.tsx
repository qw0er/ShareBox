import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import InsertDriveFileOutlined from "@mui/icons-material/InsertDriveFileOutlined";
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
import { useState } from "react";
import {
	Link as RouterLink,
	useNavigation,
	useRevalidator,
} from "react-router";
import type { PublicEntry } from "~/server/public-files.server";
import { formatSize } from "~/utils/file-format";
import { publicPageUrl } from "~/utils/public-links";

export default function PublicBrowser({
	path,
	entries,
}: {
	path: string;
	entries: PublicEntry[];
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
				return b.size - a.size || a.name.localeCompare(b.name);
			if (sort === "modified")
				return (
					b.modifiedAt.localeCompare(a.modifiedAt) ||
					a.name.localeCompare(b.name)
				);
			return a.name.localeCompare(b.name);
		});
	return (
		<Paper
			component="section"
			variant="outlined"
			aria-label="公开文件列表"
			sx={{ overflow: "hidden" }}
		>
			<Stack spacing={2.5} sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
					<Breadcrumbs sx={{ flex: 1, overflowWrap: "anywhere" }}>
						<Link component={RouterLink} to="/public" underline="hover">
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
									component={RouterLink}
									to={publicPageUrl(segments.slice(0, index + 1).join("/"))}
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
						<MenuItem value="modified">最近修改</MenuItem>
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
							component={RouterLink}
							to={publicPageUrl(segments.slice(0, -1).join("/"))}
							underline="hover"
						>
							返回上级目录
						</Link>
					</Box>
				)}
				{visible.map((entry) => (
					<Stack
						key={entry.path}
						direction="row"
						spacing={2}
						sx={{
							alignItems: "center",
							px: { xs: 2, sm: 3 },
							py: 2,
							borderTop: 1,
							borderColor: "divider",
							"&:hover": { bgcolor: "#f8faf8" },
						}}
					>
						{entry.type === "directory" ? (
							<FolderOutlined color="primary" />
						) : (
							<InsertDriveFileOutlined sx={{ color: "text.secondary" }} />
						)}
						<Box sx={{ flex: 1, minWidth: 0 }}>
							{entry.type === "directory" ? (
								<Link
									component={RouterLink}
									to={publicPageUrl(entry.path)}
									underline="hover"
									sx={{ fontWeight: 600, overflowWrap: "anywhere" }}
								>
									{entry.name}
								</Link>
							) : (
								<Typography sx={{ fontWeight: 500, overflowWrap: "anywhere" }}>
									{entry.name}
								</Typography>
							)}
							<Typography
								variant="body2"
								color="text.secondary"
								sx={{ mt: 0.5 }}
							>
								{entry.type === "directory" ? "文件夹" : formatSize(entry.size)}{" "}
								· {entry.modifiedAt.slice(0, 16).replace("T", " ")} UTC
							</Typography>
						</Box>
						{entry.downloadUrl && (
							<Button
								component="a"
								href={entry.downloadUrl}
								download={entry.name}
								startIcon={<DownloadOutlined />}
								aria-label={`下载 ${entry.name}`}
								size="small"
							>
								下载
							</Button>
						)}
					</Stack>
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
