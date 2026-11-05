import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Produces .next/standalone so the Docker image can run without node_modules.
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // Photos are proxied through our own authenticated fetch (see <StudentAvatar />),
  // so the built-in image optimizer is not used.
  images: { unoptimized: true },
};

export default nextConfig;
