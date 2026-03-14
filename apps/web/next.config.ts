import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@openlark/shared"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/api/:path*",
      },
      {
        source: "/ws/:path*",
        destination: "http://localhost:3001/ws/:path*",
      },
    ];
  },
};

export default nextConfig;
