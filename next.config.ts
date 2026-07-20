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
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
