import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Emits a traced, self-contained server bundle so the runtime image carries
  // neither the build toolchain nor the full dependency tree.
  output: 'standalone',
};

export default nextConfig;
