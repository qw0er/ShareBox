import { DATABASE } from "../config.server";
import { createShareStore } from "./store.server";

export const shareStore = createShareStore(DATABASE);
