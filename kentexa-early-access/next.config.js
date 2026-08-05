const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Uploaded media URLs come from whatever NEXT_PUBLIC_API_URL host is
    // configured at runtime, which isn't known at build time, so we skip
    // the Next.js image optimizer's domain allow-list here.
    unoptimized: true,
  },
  // Pin the workspace root — the sibling bishoo-backend has its own
  // package-lock.json, which Turbopack would otherwise detect and warn about.
  turbopack: {
    root: path.join(__dirname),
  },
};

module.exports = nextConfig;
