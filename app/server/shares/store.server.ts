import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { StateDatabase } from "../db/client.server";
import { shares } from "../db/schema";
import { logger } from "../logger.server";

export type FileIdentity = { targetDev: string; targetIno: string };

export function createShareStore(database: StateDatabase) {
	const db = database.db;
	return {
		list() {
			return db.select().from(shares).orderBy(shares.targetPath).all();
		},
		removePaths(targetPath: string) {
			const removed = db.transaction(
				(tx) => {
					const records = tx
						.select()
						.from(shares)
						.all()
						.filter((record) => inScope(record.targetPath, targetPath));
					for (const record of records)
						tx.delete(shares).where(eq(shares.id, record.id)).run();
					return records.length;
				},
				{ behavior: "immediate" },
			);
			logger.info(
				{ component: "shares", targetPath, removed },
				"Shares removed after file operation",
			);
		},
		renamePaths(fromPath: string, toPath: string) {
			const updated = db.transaction(
				(tx) => {
					const records = tx.select().from(shares).all();
					// The filesystem rename already rejected existing destinations. Any rules
					// left at that destination are stale and must not inherit the moved files.
					for (const record of records.filter((record) =>
						inScope(record.targetPath, toPath),
					)) {
						tx.delete(shares).where(eq(shares.id, record.id)).run();
					}
					const moved = records.filter((record) =>
						inScope(record.targetPath, fromPath),
					);
					for (const record of moved) {
						tx.update(shares)
							.set({
								targetPath: toPath + record.targetPath.slice(fromPath.length),
							})
							.where(eq(shares.id, record.id))
							.run();
					}
					return moved.length;
				},
				{ behavior: "immediate" },
			);
			logger.info(
				{ component: "shares", fromPath, toPath, updated },
				"Share paths renamed",
			);
		},
		find(id: string) {
			return db.select().from(shares).where(eq(shares.id, id)).get();
		},
		publish(
			targetPath: string,
			identity: FileIdentity,
			kind: "file" | "directory" = "file",
		) {
			return db.transaction(
				(tx) => {
					const existing = tx
						.select()
						.from(shares)
						.where(eq(shares.targetPath, targetPath))
						.get();
					if (
						existing &&
						existing.targetDev === identity.targetDev &&
						existing.targetIno === identity.targetIno &&
						existing.kind === kind
					)
						return existing.id;
					if (existing)
						tx.delete(shares).where(eq(shares.id, existing.id)).run();
					const id = randomBytes(16).toString("hex");
					tx.insert(shares)
						.values({
							id,
							kind,
							targetPath,
							...identity,
							createdAt: new Date().toISOString(),
						})
						.run();
					logger.info(
						{ component: "shares", targetPath, replaced: !!existing },
						"Share created",
					);
					return id;
				},
				{ behavior: "immediate" },
			);
		},
		revoke(id: string) {
			const result = db.delete(shares).where(eq(shares.id, id)).run();
			logger.info(
				{ component: "shares", removed: result.changes },
				"File share revoked",
			);
		},
	};
}
export type ShareStore = ReturnType<typeof createShareStore>;

function inScope(targetPath: string, entryPath: string) {
	return targetPath === entryPath || targetPath.startsWith(`${entryPath}/`);
}
