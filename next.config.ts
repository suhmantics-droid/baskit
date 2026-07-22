import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        // baskit.suhmantics.com is the tester surface: serve the prototype at /
        // (all other hosts get the signed-in app). Static assets and API routes
        // resolve normally because beforeFiles only claims these exact paths.
        {
          source: "/",
          has: [{ type: "host", value: "baskit.suhmantics.com" }],
          destination: "/prototype.html",
        },
        // folder URLs for the demo player
        { source: "/demo", destination: "/demo/index.html" },
        { source: "/demo/", destination: "/demo/index.html" },
        // marketing landing (shareable; the tool stays at / for testers)
        { source: "/welcome", destination: "/welcome.html" },
        // Google Search Console file check — matches only google<hex>.html.
        // TEMPORARY: drop this and app/api/gsc once the property is verified.
        {
          source: "/:file(google[a-f0-9]{6,32}\\.html)",
          destination: "/api/gsc/:file",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
