import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Baskit",
    short_name: "Baskit",
    description: "Your record. Your budget. The right time to buy.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf8",
    theme_color: "#16130f",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
