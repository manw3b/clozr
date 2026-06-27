# Backups de la base — cómo funcionan y cómo restaurar

Clozr tiene **dos capas** de backup:

## Capa 1 — PITR de Turso (recuperación a un punto en el tiempo)
Es la red de seguridad principal ante un borrado/corrupción. Se gestiona desde
el dashboard de Turso (depende del plan). Permite restaurar la base a un momento
exacto de los últimos N días. **Verificar/activar en Turso → tu base → Backups/PITR.**

## Capa 2 — Dump diario a R2 (este repo)
El worker corre `runBackup` (`src/cron/backup.ts`) en el cron diario (11:00 UTC)
y vuelca **todas las tablas** a un JSON en el bucket **privado** `clozr-backups`,
con clave `dump/YYYY-MM-DD.json`. Retención: 30 días (se podan los más viejos).

> El bucket es **privado** a propósito — NO es el de `ASSETS` (que se sirve
> público por `/assets/...`). Nunca mover los dumps a un bucket público.

### Disparar un backup on-demand
```bash
curl -X POST https://clozr-auth.pyter-import.workers.dev/admin/backup \
  -H "x-admin-secret: <JWT_SECRET>"
# → { ok: true, key: "dump/2026-06-27.json", tables, rows, bytes }
```
(`<JWT_SECRET>` es el mismo secret que usan los otros `/admin/*`.)

### Bajar / inspeccionar un dump
```bash
# listar
npx wrangler r2 object get clozr-backups/dump/2026-06-27.json --file backup.json
# o desde el dashboard de R2.
```

### Formato del dump
```jsonc
{
  "generatedAt": "2026-06-27T11:00:00.000Z",
  "database": "clozr",
  "tables": [
    { "name": "sales", "createSql": "CREATE TABLE sales (...)", "rowCount": 123, "rows": [ { ...fila... } ] }
  ]
}
```

### Restaurar desde un dump (a una base libsql/Turso vacía)
Script mínimo (Node + `@libsql/client`):
```js
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

const dump = JSON.parse(readFileSync("backup.json", "utf8"));
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

for (const t of dump.tables) {
  if (t.createSql) await db.execute(t.createSql);          // recrea el esquema
  for (const row of t.rows) {
    const cols = Object.keys(row);
    if (cols.length === 0) continue;
    const placeholders = cols.map(() => "?").join(", ");
    await db.execute({
      sql: `INSERT OR REPLACE INTO "${t.name}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`,
      args: cols.map((c) => row[c]),
    });
  }
}
console.log("restore OK");
```
> Para una restauración total preferí **PITR** (capa 1). El dump JSON es el seguro
> portable / anti-"se cae la plataforma" y para inspección puntual.
