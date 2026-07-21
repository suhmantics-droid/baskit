/** Dev peek at recent Moment rows. Run: npx tsx scripts/peek-moments.ts */
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
p.moment
  .findMany({ orderBy: { createdAt: "desc" }, take: 5 })
  .then((ms) => {
    console.log(
      JSON.stringify(
        ms.map((m) => ({ kind: m.kind, title: m.title, body: m.body, dedupeKey: m.dedupeKey, status: m.status })),
        null,
        2,
      ),
    );
    return p.$disconnect();
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
