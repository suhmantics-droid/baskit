/**
 * E4-3 verification: push a test payload to every subscription of the user who
 * owns the newest subscription, then report what survived (dead endpoints are
 * pruned by pushToUser). Run: npx tsx scripts/push-test.ts
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { pushToUser } from "../lib/push";

async function main() {
  const latest = await prisma.pushSubscription.findFirst({ orderBy: { createdAt: "desc" } });
  if (!latest) {
    console.log("no subscriptions in the table");
    return;
  }
  const before = await prisma.pushSubscription.count({ where: { userId: latest.userId } });
  const sent = await pushToUser(latest.userId, {
    title: "Baskit test",
    body: "If you can read this, web push works.",
    deeplink: "/",
    tag: "push-test",
  });
  const after = await prisma.pushSubscription.count({ where: { userId: latest.userId } });
  console.log(JSON.stringify({ subsBefore: before, sent, subsAfter: after }));
  await prisma.$disconnect();
}

main();
