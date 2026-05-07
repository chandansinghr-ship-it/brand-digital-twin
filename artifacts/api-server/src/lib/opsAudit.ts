import { db, opsActionsTable, type InsertOpsAction } from "@workspace/db";
import { logger } from "./logger";

type DbExecutor = Pick<typeof db, "insert">;

/**
 * Append an audit row. Pass a transaction handle (`tx`) when the audit row
 * must commit atomically with its mutating statements; otherwise the default
 * `db` is used and a write failure is logged but swallowed.
 */
export async function recordOpsAction(
  row: Omit<InsertOpsAction, "id" | "createdAt">,
  executor: DbExecutor = db,
): Promise<void> {
  if (executor === db) {
    try {
      await executor.insert(opsActionsTable).values(row);
    } catch (err) {
      logger.error({ err, action: row.action }, "ops_actions insert failed");
    }
    return;
  }
  // Inside a transaction: let failures propagate so the whole txn rolls back.
  await executor.insert(opsActionsTable).values(row);
}
