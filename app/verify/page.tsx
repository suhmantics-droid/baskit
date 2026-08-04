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
import { VerifyForm } from "./verify-form";

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
  return <VerifyForm initialEmail={email} error={error} />;
}
