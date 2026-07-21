import type { MetadataRoute } from "next";

// share_target makes installed Baskit appear in the OS share sheet — sharing a
// product from any store app lands on /add with the link (ticket E2-7).
// MetadataRoute.Manifest doesn't type share_target yet, so it's added on top.
export default function manifest(): MetadataRoute.Manifest & {
  share_target: {
    action: string;
    method: string;
    params: { title: string; text: string; url: string };
  };
} {
  return {
    name: "Baskit",
    short_name: "Baskit",
    description: "Your record. Your budget. The right time to buy.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf8",
    theme_color: "#16130f",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    share_target: {
      action: "/add",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
