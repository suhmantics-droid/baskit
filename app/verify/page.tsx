/**
 * Enter your sign-in code.
 *
 * Deliberately a plain form that navigates to the Auth.js callback rather than
 * a clickable link in the email: mail scanners follow links and burn the
 * single-use token before the human ever taps it, which is exactly what was
 * producing "the sign-in link is no longer valid".
 */
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { VerifyForm } from "./verify-form";
import { REMEMBERED_EMAIL_COOKIE } from "../remember-email";

export const metadata = {
  title: "Enter your sign-in code",
  robots: { index: false, follow: false },
};

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");
  const { email = "", error = "" } = await searchParams;
  const remembered = (await cookies()).get(REMEMBERED_EMAIL_COOKIE)?.value ?? "";
  return <VerifyForm initialEmail={email || remembered} error={error} />;
}
