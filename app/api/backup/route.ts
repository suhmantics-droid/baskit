/**
 * Demo-basket cloud backup (sync-lite): the demo page auto-saves the signed-in
 * visitor's whole local basket here and restores it on any device. Newest
 * write wins; no files, no JSON in the user's face.
 *   GET /api/backup — { db, at } or { db: null }
 *   PUT /api/backup — body { db }; stores with a server timestamp
 */
import { prisma } from "@/lib/db";
import { requireUser, UnauthorizedError, unauthorizedResponse } from "@/lib/session";
import type { Prisma } from "@/lib/generated/prisma/client";

// Raised from 1MB when photo-attach landed: items can carry ~20-50KB compressed
// photos, so a real basket with pictures needs headroom. 4MB stays inside
// Vercel's request-body limit with margin.
const MAX_BYTES = 4_000_000;

export async function GET() {
  try {
    const { id } = await requireUser();
    const user = await prisma.user.findUnique({
      where: { id },
      select: { demoBackup: true, demoBackupAt: true },
    });
    return Response.json({ db: user?.demoBackup ?? null, at: user?.demoBackupAt ?? null });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}

export async function PUT(request: Request) {
  try {
    const { id } = await requireUser();
    const text = await request.text();
    if (text.length > MAX_BYTES) {
      return Response.json({ error: "too_large" }, { status: 413 });
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }
    const db = (body as { db?: unknown })?.db;
    if (!db || typeof db !== "object" || !("profiles" in (db as object))) {
      return Response.json({ error: "not_a_basket" }, { status: 400 });
    }
    const at = new Date();
    await prisma.user.update({
      where: { id },
      data: { demoBackup: db as Prisma.InputJsonValue, demoBackupAt: at },
    });
    return Response.json({ ok: true, at });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}
