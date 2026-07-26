import type { Metadata } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import "./app.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

/**
 * The reading voice. Was the -apple-system/Inter/Roboto stack, which meant the
 * intended render on Android was Roboto: the exact generic default the house
 * standard bans. Instrument Sans has the high x-height and slight warmth that
 * sits under Fraunces without competing with it.
 */
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Baskit: everything you want, in one place",
  description:
    "A universal wishlist with nested budgets, a buy/wait decision engine, and price tracking.",
  openGraph: {
    title: "Baskit. Decide better, buy intentional",
    description: "Your record. Your budget. The right time to buy.",
    images: ["/og.png"],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

/** Applies the saved theme before first paint so dark mode never flashes. */
const themeInit = `try{var t=localStorage.getItem("baskit.theme");if(t){document.documentElement.setAttribute("data-theme",t)}}catch(e){}`;

/** Registers the service worker (PWA share sheet + push) after load. */
const swInit = `if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})})}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${fraunces.variable} ${instrumentSans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full">
        {children}
        <Analytics />
        <script dangerouslySetInnerHTML={{ __html: swInit }} />
      </body>
    </html>
  );
}
