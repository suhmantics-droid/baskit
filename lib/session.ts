/**
 * Session helpers for route handlers (ticket E0-3).
 *
 * Every mutating route calls requireUser() and scopes queries by the returned
 * id — a signed-in person can only ever see and touch their own basket.
 */
import { auth } from "@/auth";

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthorizedError";
  }
}

/** Returns the signed-in user's { id, email } or throws UnauthorizedError. */
export async function requireUser(): Promise<{ id: string; email: string }> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) throw new UnauthorizedError();
  return { id: user.id, email: user.email };
}

/** Wraps a handler body: UnauthorizedError becomes a 401 JSON response. */
export function unauthorizedResponse(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
