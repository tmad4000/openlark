/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@openlark/shared"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
