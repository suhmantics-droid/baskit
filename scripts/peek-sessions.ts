import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
p.session.findMany({ orderBy: { expires: "desc" }, include: { user: { select: { email: true } } } })
  .then((ss) => {
    const now = Date.now();
    console.log("sessions: " + ss.length);
    for (const s of ss) {
      const days = (s.expires.getTime() - now) / 86400000;
      console.log("  " + (s.user.email ?? "").slice(0,6) + "*** expires " + s.expires.toISOString().slice(0,10) + "  (" + days.toFixed(1) + " days left)");
    }
    return p.verificationToken.count().then((n) => console.log("\npending magic-link tokens: " + n));
  })
  .then(() => p.$disconnect())
  .catch((e) => { console.error(e.message); process.exit(1); });
