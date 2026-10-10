import DirectoryBrowser from "~/components/files/DirectoryBrowser";
import type { PublicEntry } from "~/server/public-files.server";
import { publicPageUrl } from "~/utils/public-links";
import PublicEntryItem from "./PublicEntryItem";

export default function PublicBrowser({
	path,
	entries,
}: {
	path: string;
	entries: PublicEntry[];
}) {
	return (
		<DirectoryBrowser
			path={path}
			directoryUrl={publicPageUrl}
			entries={entries}
			renderEntry={(entry) => <PublicEntryItem entry={entry} />}
		/>
	);
}
