import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
(async () => {
  const [users, items, withUrl, checked, prices, moments, lists, shared, subs] = await Promise.all([
    p.user.count(), p.item.count(), p.item.count({ where: { url: { not: null } } }),
    p.item.count({ where: { lastCheckedAt: { not: null } } }),
    p.pricePoint.count(), p.moment.count(), p.list.count(),
    p.list.count({ where: { shareToken: { not: null } } }),
    p.pushSubscription.count(),
  ]);
  console.log(`users=${users} lists=${lists} items=${items} (withUrl=${withUrl}, everChecked=${checked}) pricePoints=${prices} moments=${moments} sharedLists=${shared} pushSubs=${subs}`);
  const recent = await p.item.findMany({ where: { lastCheckedAt: { not: null } }, orderBy: { lastCheckedAt: "desc" }, take: 3, select: { name: true, lastCheckedAt: true } });
  console.log("\nmost recent price checks (accounts-app items):");
  for (const r of recent) console.log("  " + r.lastCheckedAt?.toISOString().slice(0,16).replace("T"," ") + "  " + r.name.slice(0,40));
  const ms = await p.moment.findMany({ orderBy: { createdAt: "desc" }, take: 3, select: { kind: true, title: true, createdAt: true } });
  console.log("\nmost recent moments:");
  for (const m of ms) console.log("  " + m.createdAt.toISOString().slice(0,16).replace("T"," ") + "  [" + m.kind + "] " + m.title.slice(0,45));
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
