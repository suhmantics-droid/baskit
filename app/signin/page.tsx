/**
 * Baskit's own sign-in page, replacing the default Auth.js one.
 *
 * Two reasons it exists: the default page cannot carry the typed email through
 * to the code screen, so people had to type it twice; and it gives Google the
 * prominence it deserves, since one tap beats waiting for an email.
 */
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SignInForm } from "./signin-form";
import { REMEMBERED_EMAIL_COOKIE } from "../remember-email";

export const metadata = {
  title: "Sign in to Baskit",
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");
  const { callbackUrl = "/", error = "" } = await searchParams;
  const remembered = (await cookies()).get(REMEMBERED_EMAIL_COOKIE)?.value ?? "";
  return (
    <SignInForm
      callbackUrl={callbackUrl}
      error={error}
      hasGoogle={Boolean(process.env.AUTH_GOOGLE_ID)}
      initialEmail={remembered}
    />
  );
}
