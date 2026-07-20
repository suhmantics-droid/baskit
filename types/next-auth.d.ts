import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  /** The session callback in auth.ts adds the stable user id. */
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
