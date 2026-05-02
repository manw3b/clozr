import { dbSelect, dbExecute } from "./index";
import type { ExchangeRate } from "./types";

const DEFAULT_RATE = 1000;

export async function getRate(workspaceId: string): Promise<ExchangeRate> {
  const rows = await dbSelect<ExchangeRate>(
    "SELECT * FROM exchange_rates WHERE workspace_id = ? LIMIT 1",
    [workspaceId],
  );
  if (rows[0]) return rows[0];
  return {
    id: `${workspaceId}-rate`,
    workspace_id: workspaceId,
    usd_to_ars: DEFAULT_RATE,
    updated_at: new Date().toISOString(),
    updated_by: null,
  };
}

export async function setRate(workspaceId: string, usdToArs: number): Promise<void> {
  await dbExecute(
    `INSERT OR REPLACE INTO exchange_rates (id, workspace_id, usd_to_ars, updated_at)
     VALUES (?, ?, ?, datetime('now'))`,
    [`${workspaceId}-rate`, workspaceId, usdToArs],
  );
}

export const exchangeRateDb = { getRate, setRate };
