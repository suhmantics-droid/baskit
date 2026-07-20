import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import "./app.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Baskit — everything you want, in one place",
  description:
    "A universal wishlist with nested budgets, a buy/wait decision engine, and price tracking.",
};

/** Applies the saved theme before first paint so dark mode never flashes. */
const themeInit = `try{var t=localStorage.getItem("baskit.theme");if(t){document.documentElement.setAttribute("data-theme",t)}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${fraunces.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
