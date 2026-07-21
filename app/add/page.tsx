/**
 * /add — the share-sheet receiver (ticket E2-7). An installed Baskit appears
 * in the OS share menu; sharing a product from any store app lands here with
 * title/text/url query params. Signed out → magic-link sign-in and straight
 * back here with the same params.
 */
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AddCapture } from "../components/add-capture";

export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; text?: string; url?: string }>;
}) {
  const params = await searchParams;
  const session = await auth().catch(() => null);
  if (!session?.user?.id) {
    const qs = new URLSearchParams();
    if (params.title) qs.set("title", params.title);
    if (params.text) qs.set("text", params.text);
    if (params.url) qs.set("url", params.url);
    const back = `/add${qs.size ? `?${qs}` : ""}`;
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(back)}`);
  }
  return <AddCapture title={params.title ?? ""} text={params.text ?? ""} url={params.url ?? ""} />;
}
