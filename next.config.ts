import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  serverExternalPackages: ['unpdf', 'xlsx', '@prisma/client'],
};

export default config;
