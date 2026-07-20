/**
 * Seed script — mirrors the prototype's sample data (Christmas → Mum/Dad/Kids,
 * Birthday ideas, Treat myself) so a fresh database looks like the demo.
 *
 * Money is minor units (pence). Run with: `npm run db:seed` (needs DATABASE_URL).
 */
import "dotenv/config";
import { prisma } from "../lib/db";

const DAY = 86_400_000;
const now = Date.now();
/** £ → pence. */
const p = (pounds: number) => Math.round(pounds * 100);

interface SeedItem {
  name: string;
  category: string;
  currency: string;
  history: number[]; // pounds, oldest → newest
  targetPrice?: number; // pounds
  stock: string;
  status: string;
  priority: string;
  cooldownDays: number;
  waitUntil?: number; // epoch ms
  tags?: string[];
  code?: string;
  bought?: boolean;
  fav?: boolean;
  listKey: string; // which list it belongs to
}

async function main() {
  // Clean slate (respect FK order).
  await prisma.moment.deleteMany();
  await prisma.pricePoint.deleteMany();
  await prisma.itemList.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.listMember.deleteMany();
  await prisma.item.deleteMany();
  await prisma.list.deleteMany();
  await prisma.saleSignal.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: {
      email: "demo@baskit.local",
      name: "Demo",
      currency: "GBP",
      monthlyBudget: p(200),
    },
  });

  // Lists (parents first so children can reference them).
  const xmas = await prisma.list.create({
    data: { ownerId: user.id, name: "Christmas gifts", emoji: "🎄", cap: p(500) },
  });
  const mum = await prisma.list.create({
    data: { ownerId: user.id, name: "Mum", emoji: "💝", parentId: xmas.id, cap: p(150) },
  });
  const dad = await prisma.list.create({
    data: { ownerId: user.id, name: "Dad", emoji: "🎁", parentId: xmas.id, cap: p(150) },
  });
  const kids = await prisma.list.create({
    data: { ownerId: user.id, name: "Kids", emoji: "🧸", parentId: xmas.id, cap: p(200) },
  });
  const bday = await prisma.list.create({
    data: { ownerId: user.id, name: "Birthday ideas", emoji: "🎂", cap: p(120) },
  });
  const treat = await prisma.list.create({
    data: { ownerId: user.id, name: "Treat myself", emoji: "✨" },
  });

  const listByKey: Record<string, string> = {
    mum: mum.id,
    dad: dad.id,
    kids: kids.id,
    bday: bday.id,
    treat: treat.id,
  };

  const items: SeedItem[] = [
    { name: "Le Creuset casserole dish", category: "Home", currency: "GBP", history: [210, 189], stock: "in", status: "want", priority: "must", cooldownDays: 0, fav: true, listKey: "mum" },
    { name: "Cashmere scarf", category: "Fashion", currency: "GBP", history: [75], stock: "in", status: "later", priority: "nice", cooldownDays: 0, listKey: "mum" },
    { name: "Whisky decanter set", category: "Home", currency: "GBP", history: [110], stock: "low", status: "want", priority: "nice", cooldownDays: 0, listKey: "dad" },
    { name: "Wireless meat thermometer", category: "Tech", currency: "GBP", history: [89, 79], stock: "in", status: "research", priority: "nice", cooldownDays: 0, listKey: "dad" },
    { name: "LEGO Botanicals set", category: "Toys", currency: "GBP", history: [55], stock: "in", status: "want", priority: "must", cooldownDays: 0, bought: true, listKey: "kids" },
    { name: "Nintendo Switch game", category: "Games", currency: "GBP", history: [50, 45], stock: "in", status: "want", priority: "nice", cooldownDays: 0, listKey: "kids" },
    { name: "Kids' art easel", category: "Toys", currency: "GBP", history: [120], stock: "in", status: "research", priority: "impulse", cooldownDays: 0, listKey: "kids" },
    { name: "Sony WH-1000XM6 headphones", category: "Tech", currency: "GBP", history: [349, 339, 329], targetPrice: 279, stock: "in", status: "later", priority: "nice", cooldownDays: 14, waitUntil: now - DAY, tags: ["audio"], code: "AUDIO10", fav: true, listKey: "treat" },
    { name: "Aesop hand balm", category: "Beauty", currency: "GBP", history: [27], stock: "in", status: "want", priority: "nice", cooldownDays: 0, listKey: "bday" },
    { name: "Fujifilm instant camera", category: "Tech", currency: "GBP", history: [99], targetPrice: 80, stock: "in", status: "research", priority: "impulse", cooldownDays: 7, waitUntil: now + 7 * DAY, listKey: "bday" },
  ];

  for (let i = 0; i < items.length; i++) {
    const s = items[i];
    const createdAt = new Date(now - (i + 2) * DAY);
    const pricePoints = s.history.map((pounds, j) => ({
      price: p(pounds),
      source: "manual",
      checkedAt: new Date(createdAt.getTime() + j * DAY),
    }));
    await prisma.item.create({
      data: {
        userId: user.id,
        name: s.name,
        category: s.category,
        currency: s.currency,
        price: p(s.history[s.history.length - 1]),
        targetPrice: s.targetPrice != null ? p(s.targetPrice) : null,
        stock: s.stock,
        status: s.status,
        priority: s.priority,
        cooldownDays: s.cooldownDays,
        waitUntil: s.waitUntil != null ? new Date(s.waitUntil) : null,
        tags: s.tags ?? [],
        code: s.code ?? null,
        bought: s.bought ?? false,
        fav: s.fav ?? false,
        createdAt,
        prices: { create: pricePoints },
        lists: { create: [{ listId: listByKey[s.listKey] }] },
      },
    });
  }

  const counts = {
    users: await prisma.user.count(),
    lists: await prisma.list.count(),
    items: await prisma.item.count(),
    pricePoints: await prisma.pricePoint.count(),
  };
  console.log("Seeded:", counts);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
