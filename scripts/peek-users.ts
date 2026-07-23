/**
 * Who has signed in, and is their basket actually safe in the cloud?
 * Read-only. Run: npx tsx scripts/peek-users.ts
 */
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// db.items is an object keyed by profile id, each holding an array of items
function itemCount(backup: unknown): number | null {
  if (!backup || typeof backup !== "object") return null;
  const byProfile = (backup as { items?: Record<string, unknown[]> }).items;
  if (!byProfile || typeof byProfile !== "object") return null;
  return Object.values(byProfile).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);
}

p.user
  .findMany({
    orderBy: { createdAt: "desc" },
    select: { email: true, name: true, createdAt: true, demoBackupAt: true, demoBackup: true },
  })
  .then(async (users) => {
    const rows = users.map((u) => ({
      email: (u.email ?? "").replace(/(.{2}).*(@.*)/, "$1***$2"),
      name: u.name ?? "(not set)",
      joined: u.createdAt.toISOString().slice(0, 16).replace("T", " "),
      cloudBackup: u.demoBackupAt ? u.demoBackupAt.toISOString().slice(0, 16).replace("T", " ") : "NONE",
      itemsInCloud: itemCount(u.demoBackup),
    }));
    console.table(rows);
    const withBackup = rows.filter((r) => r.cloudBackup !== "NONE").length;
    const dbItems = await p.item.count();
    console.log(
      `\n${users.length} account(s) | ${withBackup} with a cloud backup of the prototype basket | ${dbItems} item(s) saved via the accounts app`,
    );
    return p.$disconnect();
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
