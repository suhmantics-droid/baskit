/**
 * Prisma client singleton. Reused across hot reloads in dev so we don't exhaust
 * database connections.
 *
 * Prisma 7 uses driver adapters: the Postgres connection runs through
 * @prisma/adapter-pg (node-postgres) using DATABASE_URL. The client is generated
 * into lib/generated/prisma (see prisma/schema.prisma) — run `npm run db:generate`.
 */
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
