/**
 * Read-only safety net: write every user's cloud backup blob to a timestamped
 * folder OUTSIDE the repo, so a basket can always be restored by hand.
 * Writes nothing to the database. Run: npx tsx scripts/snapshot-backups.ts
 */
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";

const OUT_ROOT = "D:\\baskit-backups"; // deliberately outside the git repo

const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

function countItems(backup: unknown): number {
  const byProfile = (backup as { items?: Record<string, unknown[]> } | null)?.items;
  if (!byProfile || typeof byProfile !== "object") return 0;
  return Object.values(byProfile).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);
}

p.user
  .findMany({
    where: { demoBackup: { not: undefined } },
    select: { id: true, email: true, name: true, demoBackup: true, demoBackupAt: true },
  })
  .then((users) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dir = join(OUT_ROOT, stamp);
    mkdirSync(dir, { recursive: true });
    let written = 0;
    for (const u of users) {
      if (!u.demoBackup) continue;
      const safe = (u.email ?? u.id).replace(/[^a-z0-9]+/gi, "_");
      const payload = {
        email: u.email,
        name: u.name,
        backedUpAt: u.demoBackupAt,
        snapshotAt: new Date().toISOString(),
        itemCount: countItems(u.demoBackup),
        db: u.demoBackup,
      };
      writeFileSync(join(dir, `${safe}.json`), JSON.stringify(payload, null, 2), "utf8");
      console.log(`  saved ${safe}.json  (${payload.itemCount} items)`);
      written++;
    }
    console.log(`\n${written} backup(s) snapshotted to ${dir}`);
    return p.$disconnect();
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
