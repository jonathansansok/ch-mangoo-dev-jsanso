const BOOT_TIME = new Date().toISOString();

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    commit: process.env['RAILWAY_GIT_COMMIT_SHA'] ?? 'dev',
    node: process.version,
    bootedAt: BOOT_TIME,
  });
}
