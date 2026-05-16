import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  serverExternalPackages: ['pdf-parse', 'xlsx', '@prisma/client'],
};

export default config;
